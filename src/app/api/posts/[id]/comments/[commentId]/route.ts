import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsPostComments, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { isAdmin } from '@/lib/auth';

/** Delete a comment (its author, or an admin). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { commentId } = await params;

  const db = getDb();
  const [comment] = await db.select().from(adsPostComments).where(eq(adsPostComments.id, commentId)).limit(1);
  if (!comment) return NextResponse.json({ ok: true });
  if (comment.authorEmail !== session.email && !isAdmin(session)) {
    return NextResponse.json({ error: 'You can only delete your own comments.' }, { status: 403 });
  }
  await db.delete(adsPostComments).where(eq(adsPostComments.id, commentId));
  return NextResponse.json({ ok: true });
}
