import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsInboxMessages, adsInboxThreads, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { deliverReply } from '@/lib/inbox';

type Params = { params: Promise<{ id: string }> };

/**
 * Post a reply on a thread. Sends via the connected channel when wired; otherwise the reply is
 * captured and left `queued`. Either way it's recorded on the thread and the thread is marked read.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim();
  if (!text) return NextResponse.json({ error: 'Reply text is required.' }, { status: 400 });

  const db = getDb();
  const [thread] = await db.select().from(adsInboxThreads).where(eq(adsInboxThreads.id, id)).limit(1);
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await deliverReply(
    { platform: thread.platform, externalId: thread.externalId, accountId: thread.accountId },
    text.slice(0, 8000),
  );
  const status = result.delivered ? 'sent' : result.error ? 'failed' : 'queued';

  const [message] = await db
    .insert(adsInboxMessages)
    .values({
      threadId: id,
      direction: 'out',
      externalId: result.externalId ?? null,
      authorName: session.name,
      body: text.slice(0, 8000),
      status,
      sentBy: session.email,
      errorText: result.error ?? null,
    })
    .returning();

  await db
    .update(adsInboxThreads)
    .set({ unread: false, lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(adsInboxThreads.id, id));

  await recordAudit(session, 'inbox_reply', 'ads_inbox_thread', id, { status });
  return NextResponse.json({ ok: true, message, delivery: status });
}
