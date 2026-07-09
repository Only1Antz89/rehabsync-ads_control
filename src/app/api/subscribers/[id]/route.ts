import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsSubscribers, getDb } from '@/db';
import { recordAudit } from '@/lib/audit';
import { unsubscribeEmail } from '@/lib/newsletters';
import { isResponse, requireSession } from '@/lib/route-auth';

type Params = { params: Promise<{ id: string }> };

/** Update a subscriber: replace tags, or action:'unsubscribe' (suppresses — same as one-click). */
export async function PATCH(req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    tags?: string[];
    action?: 'unsubscribe';
  } | null;

  const db = getDb();
  const [subscriber] = await db.select().from(adsSubscribers).where(eq(adsSubscribers.id, id)).limit(1);
  if (!subscriber) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body?.action === 'unsubscribe') {
    await unsubscribeEmail(subscriber.email, `staff:${session.email}`);
    await recordAudit(session, 'subscriber_unsubscribed', 'ads_subscriber', id, { email: subscriber.email });
    return NextResponse.json({ ok: true });
  }

  if (Array.isArray(body?.tags)) {
    const tags = [...new Set(body.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
    await db.update(adsSubscribers).set({ tags, updatedAt: new Date() }).where(eq(adsSubscribers.id, id));
    await recordAudit(session, 'subscriber_tags_updated', 'ads_subscriber', id, { tags });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
}

/** Erase a subscriber entirely (GDPR erasure) — suppression rows are kept so we honour the opt-out. */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const deleted = await db
    .delete(adsSubscribers)
    .where(eq(adsSubscribers.id, id))
    .returning({ email: adsSubscribers.email });
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit(session, 'subscriber_deleted', 'ads_subscriber', id, { email: deleted[0]?.email });
  return NextResponse.json({ ok: true });
}
