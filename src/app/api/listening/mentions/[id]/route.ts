import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsListeningMentions, getDb, LISTENING_MENTION_STATUSES } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';

type Params = { params: Promise<{ id: string }> };

/** Triage a mention (mark reviewed / archived / new). */
export async function PATCH(req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  if (!body?.status || !(LISTENING_MENTION_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const [updated] = await getDb()
    .update(adsListeningMentions)
    .set({ status: body.status })
    .where(eq(adsListeningMentions.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ mention: updated });
}
