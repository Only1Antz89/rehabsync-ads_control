import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { adsPostComments, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

/** List internal comments on a post. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const comments = await getDb()
    .select()
    .from(adsPostComments)
    .where(eq(adsPostComments.postId, id))
    .orderBy(asc(adsPostComments.createdAt))
    .limit(200);
  return NextResponse.json({ comments });
}

/** Add an internal comment to a post. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { body?: string } | null;
  const text = body?.body?.trim();
  if (!text) return NextResponse.json({ error: 'Comment cannot be empty.' }, { status: 400 });

  const [comment] = await getDb()
    .insert(adsPostComments)
    .values({ postId: id, authorEmail: session.email, authorName: session.name, body: text.slice(0, 2000) })
    .returning();
  return NextResponse.json({ comment }, { status: 201 });
}
