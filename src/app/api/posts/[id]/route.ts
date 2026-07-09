import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsPostTargets, adsPosts, adsSocialAccounts, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { publishPostNow } from '@/lib/publisher';
import { recordAudit } from '@/lib/audit';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const db = getDb();

  const [post] = await db.select().from(adsPosts).where(eq(adsPosts.id, id)).limit(1);
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const targets = await db
    .select({
      id: adsPostTargets.id,
      accountId: adsPostTargets.accountId,
      platform: adsPostTargets.platform,
      status: adsPostTargets.status,
      platformPostId: adsPostTargets.platformPostId,
      platformUrl: adsPostTargets.platformUrl,
      error: adsPostTargets.error,
      attemptCount: adsPostTargets.attemptCount,
      publishedAt: adsPostTargets.publishedAt,
      accountName: adsSocialAccounts.displayName,
    })
    .from(adsPostTargets)
    .leftJoin(adsSocialAccounts, eq(adsSocialAccounts.id, adsPostTargets.accountId))
    .where(eq(adsPostTargets.postId, id));

  return NextResponse.json({ post, targets });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const db = getDb();

  const [post] = await db.select().from(adsPosts).where(eq(adsPosts.id, id)).limit(1);
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    body?: string;
    linkUrl?: string | null;
    imageUrl?: string | null;
    scheduledAt?: string | null;
    action?: 'publish_now' | 'unschedule';
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  if (body.action === 'publish_now') {
    try {
      const status = await publishPostNow(id);
      await recordAudit(session, 'post_publish_now', 'ads_post', id, { status });
      return NextResponse.json({ status });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  if (post.status === 'publishing') {
    return NextResponse.json({ error: 'Post is being published right now' }, { status: 409 });
  }

  const values: Partial<typeof adsPosts.$inferInsert> = { updatedAt: new Date() };
  if (body.body !== undefined) values.body = body.body.trim();
  if (body.linkUrl !== undefined) values.linkUrl = body.linkUrl?.trim() || null;
  if (body.imageUrl !== undefined) values.imageUrl = body.imageUrl?.trim() || null;
  if (body.action === 'unschedule') {
    values.status = 'draft';
    values.scheduledAt = null;
  } else if (body.scheduledAt !== undefined) {
    values.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    values.status = body.scheduledAt ? 'scheduled' : 'draft';
  }

  const [updated] = await db.update(adsPosts).set(values).where(eq(adsPosts.id, id)).returning();
  await recordAudit(session, 'post_updated', 'ads_post', id, {
    changed: Object.keys(values).filter((k) => k !== 'updatedAt'),
  });
  return NextResponse.json({ post: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const db = getDb();

  const [post] = await db.select().from(adsPosts).where(eq(adsPosts.id, id)).limit(1);
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  if (post.status !== 'draft' && post.status !== 'scheduled' && post.status !== 'failed') {
    return NextResponse.json({ error: 'Only draft, scheduled or failed posts can be deleted' }, { status: 400 });
  }

  await db.delete(adsPosts).where(eq(adsPosts.id, id));
  await recordAudit(session, 'post_deleted', 'ads_post', id, { status: post.status });
  return NextResponse.json({ ok: true });
}
