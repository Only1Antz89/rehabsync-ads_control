import { NextResponse } from 'next/server';
import { desc, inArray, sql } from 'drizzle-orm';
import { adsNewsletterRecipients, adsNewsletters, getDb } from '@/db';
import type { NewsletterSegment } from '@/db';
import { recordAudit } from '@/lib/audit';
import { isResponse, requireSession } from '@/lib/route-auth';

/** List newsletters with recipient counts (any staff — drafting is open, sending is admin-only). */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const db = getDb();
  const issues = await db.select().from(adsNewsletters).orderBy(desc(adsNewsletters.createdAt)).limit(50);

  const ids = issues.map((i) => i.id);
  const counts = ids.length
    ? await db
        .select({
          newsletterId: adsNewsletterRecipients.newsletterId,
          recipients: sql<number>`count(*)::int`,
        })
        .from(adsNewsletterRecipients)
        .where(inArray(adsNewsletterRecipients.newsletterId, ids))
        .groupBy(adsNewsletterRecipients.newsletterId)
    : [];
  const countById = new Map(counts.map((c) => [c.newsletterId, c.recipients]));

  return NextResponse.json({
    newsletters: issues.map((issue) => ({
      id: issue.id,
      name: issue.name,
      subject: issue.subject,
      status: issue.status,
      segment: issue.segment,
      scheduledAt: issue.scheduledAt,
      sentAt: issue.sentAt,
      recipients: countById.get(issue.id) ?? 0,
      createdAt: issue.createdAt,
    })),
  });
}

function cleanSegment(input: unknown): NewsletterSegment {
  const segment = (input ?? {}) as { tags?: unknown };
  const tags = Array.isArray(segment.tags)
    ? [...new Set(segment.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 20)
    : [];
  return tags.length ? { tags } : {};
}

/** Create a draft issue. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    subject?: string;
    html?: string;
    segment?: unknown;
  } | null;

  const name = body?.name?.trim() ?? '';
  const subject = body?.subject?.trim() ?? '';
  if (!name || !subject) {
    return NextResponse.json({ error: 'Name and subject are required.' }, { status: 400 });
  }

  const db = getDb();
  const [created] = await db
    .insert(adsNewsletters)
    .values({
      name: name.slice(0, 160),
      subject: subject.slice(0, 255),
      html: body?.html ?? '',
      segment: cleanSegment(body?.segment),
      createdBy: session.email,
    })
    .returning({ id: adsNewsletters.id });

  await recordAudit(session, 'newsletter_created', 'ads_newsletter', created?.id ?? null, { name });
  return NextResponse.json({ ok: true, id: created?.id }, { status: 201 });
}
