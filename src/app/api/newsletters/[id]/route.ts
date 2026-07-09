import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { adsEmailEvents, adsNewsletterRecipients, adsNewsletters, getDb } from '@/db';
import type { NewsletterSegment } from '@/db';
import { isAdmin } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { processNewsletters } from '@/lib/newsletters';
import { isResponse, requireSession } from '@/lib/route-auth';

type Params = { params: Promise<{ id: string }> };

/** Per-issue report: delivery breakdown from recipient statuses + unique-recipient event counts. */
export async function GET(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const [issue] = await db.select().from(adsNewsletters).where(eq(adsNewsletters.id, id)).limit(1);
  if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [recipients] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where ${adsNewsletterRecipients.status} not in ('pending','failed','suppressed'))::int`,
      failed: sql<number>`count(*) filter (where ${adsNewsletterRecipients.status} = 'failed')::int`,
      suppressed: sql<number>`count(*) filter (where ${adsNewsletterRecipients.status} = 'suppressed')::int`,
      pending: sql<number>`count(*) filter (where ${adsNewsletterRecipients.status} = 'pending')::int`,
    })
    .from(adsNewsletterRecipients)
    .where(eq(adsNewsletterRecipients.newsletterId, id));

  const eventRows = await db
    .select({
      event: adsEmailEvents.event,
      uniques: sql<number>`count(distinct ${adsEmailEvents.email})::int`,
    })
    .from(adsEmailEvents)
    .where(eq(adsEmailEvents.newsletterId, id))
    .groupBy(adsEmailEvents.event);
  const events: Record<string, number> = {};
  for (const row of eventRows) events[row.event] = row.uniques;

  return NextResponse.json({
    newsletter: {
      id: issue.id,
      name: issue.name,
      subject: issue.subject,
      html: issue.html,
      segment: issue.segment,
      status: issue.status,
      scheduledAt: issue.scheduledAt,
      sentAt: issue.sentAt,
    },
    recipients: recipients ?? { total: 0, sent: 0, failed: 0, suppressed: 0, pending: 0 },
    events,
  });
}

function cleanSegment(input: unknown): NewsletterSegment {
  const segment = (input ?? {}) as { tags?: unknown };
  const tags = Array.isArray(segment.tags)
    ? [...new Set(segment.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 20)
    : [];
  return tags.length ? { tags } : {};
}

/** Edit a draft, or run an action: schedule / send_now / cancel (actions are admin-only). */
export async function PATCH(req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    subject?: string;
    html?: string;
    segment?: unknown;
    action?: 'schedule' | 'send_now' | 'cancel';
    scheduledAt?: string;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const db = getDb();
  const [issue] = await db.select().from(adsNewsletters).where(eq(adsNewsletters.id, id)).limit(1);
  if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body.action) {
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Sending needs an admin.' }, { status: 403 });
    }

    if (body.action === 'schedule') {
      const when = body.scheduledAt ? new Date(body.scheduledAt) : null;
      if (!when || Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60000) {
        return NextResponse.json({ error: 'Pick a valid future time.' }, { status: 400 });
      }
      if (issue.status !== 'draft' && issue.status !== 'scheduled') {
        return NextResponse.json({ error: `Cannot schedule a ${issue.status} newsletter.` }, { status: 409 });
      }
      await db
        .update(adsNewsletters)
        .set({ status: 'scheduled', scheduledAt: when, updatedAt: new Date() })
        .where(eq(adsNewsletters.id, id));
      await recordAudit(session, 'newsletter_scheduled', 'ads_newsletter', id, { scheduledAt: when.toISOString() });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'send_now') {
      if (!['draft', 'scheduled'].includes(issue.status)) {
        return NextResponse.json({ error: `Cannot send a ${issue.status} newsletter.` }, { status: 409 });
      }
      await db
        .update(adsNewsletters)
        .set({ status: 'scheduled', scheduledAt: new Date(), updatedAt: new Date() })
        .where(eq(adsNewsletters.id, id));
      await recordAudit(session, 'newsletter_send_now', 'ads_newsletter', id, {});
      const result = await processNewsletters(id);
      return NextResponse.json({ ok: true, processed: result.processed });
    }

    // cancel
    if (!['scheduled', 'sending'].includes(issue.status)) {
      return NextResponse.json({ error: `Cannot cancel a ${issue.status} newsletter.` }, { status: 409 });
    }
    await db
      .update(adsNewsletters)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(adsNewsletters.id, id));
    await recordAudit(session, 'newsletter_cancelled', 'ads_newsletter', id, {});
    return NextResponse.json({ ok: true });
  }

  // Content edits are draft-only so what was sent is never rewritten after the fact.
  if (issue.status !== 'draft') {
    return NextResponse.json({ error: 'Only drafts can be edited.' }, { status: 409 });
  }
  const updates: Partial<typeof adsNewsletters.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 160);
  if (typeof body.subject === 'string' && body.subject.trim()) updates.subject = body.subject.trim().slice(0, 255);
  if (typeof body.html === 'string') updates.html = body.html;
  if (body.segment !== undefined) updates.segment = cleanSegment(body.segment);
  await db.update(adsNewsletters).set(updates).where(eq(adsNewsletters.id, id));
  await recordAudit(session, 'newsletter_updated', 'ads_newsletter', id, {});
  return NextResponse.json({ ok: true });
}

/** Delete a draft or cancelled issue (sent history is immutable). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const deleted = await db
    .delete(adsNewsletters)
    .where(and(eq(adsNewsletters.id, id), sql`${adsNewsletters.status} in ('draft','cancelled')`))
    .returning({ id: adsNewsletters.id, name: adsNewsletters.name });
  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Only draft or cancelled newsletters can be deleted.' }, { status: 409 });
  }
  await recordAudit(session, 'newsletter_deleted', 'ads_newsletter', id, { name: deleted[0]?.name });
  return NextResponse.json({ ok: true });
}
