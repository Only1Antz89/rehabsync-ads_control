import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { adsInboxMessages, adsInboxThreads, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { suggestReply } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** AI-drafted reply suggestion for a thread (human edits + sends it; the AI never posts). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const [thread] = await db.select().from(adsInboxThreads).where(eq(adsInboxThreads.id, id)).limit(1);
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const messages = await db
    .select({ direction: adsInboxMessages.direction, authorName: adsInboxMessages.authorName, body: adsInboxMessages.body })
    .from(adsInboxMessages)
    .where(eq(adsInboxMessages.threadId, id))
    .orderBy(asc(adsInboxMessages.createdAt))
    .limit(12);

  const result = await suggestReply({ platform: thread.platform, kind: thread.kind, messages });
  if (result.source === 'unavailable') {
    return NextResponse.json(
      { error: result.error ?? 'AI suggestions are not configured — set REHABSYNC_AI_URL and REHABSYNC_AI_API_KEY.' },
      { status: 503 },
    );
  }
  return NextResponse.json({ suggestion: result.suggestion });
}
