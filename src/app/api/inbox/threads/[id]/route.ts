import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { adsInboxMessages, adsInboxThreads, getDb, INBOX_STATUSES } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/** Thread with its full message history. Opening it marks it read. */
export async function GET(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const [thread] = await db.select().from(adsInboxThreads).where(eq(adsInboxThreads.id, id)).limit(1);
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const messages = await db
    .select()
    .from(adsInboxMessages)
    .where(eq(adsInboxMessages.threadId, id))
    .orderBy(asc(adsInboxMessages.createdAt))
    .limit(500);

  if (thread.unread) {
    await db.update(adsInboxThreads).set({ unread: false, updatedAt: new Date() }).where(eq(adsInboxThreads.id, id));
  }

  return NextResponse.json({ thread: { ...thread, unread: false }, messages });
}

/** Triage a thread: status, assignment, or read/unread. */
export async function PATCH(req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    status?: string;
    assignedTo?: string | null;
    unread?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const updates: Partial<typeof adsInboxThreads.$inferInsert> = { updatedAt: new Date() };
  if (body.status !== undefined) {
    if (!(INBOX_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo?.trim() || null;
  if (body.unread !== undefined) updates.unread = body.unread;

  const db = getDb();
  const [updated] = await db.update(adsInboxThreads).set(updates).where(eq(adsInboxThreads.id, id)).returning();
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body.status !== undefined) {
    await recordAudit(session, 'inbox_status_changed', 'ads_inbox_thread', id, { status: body.status });
  }
  return NextResponse.json({ thread: updated });
}
