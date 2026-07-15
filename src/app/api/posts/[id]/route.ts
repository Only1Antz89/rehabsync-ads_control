import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsPostTargets, adsPosts, adsSocialAccounts, getDb } from '@/db';
import type { SocialPlatform } from '@/db';
import { isAdmin } from '@/lib/auth';
import { isResponse, requireSession } from '@/lib/route-auth';
import { publishPostNow } from '@/lib/publisher';
import { getSettings } from '@/lib/settings';
import { blockingProblems } from '@/lib/social/validate';
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
      bodyOverride: adsPostTargets.bodyOverride,
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
    imageUrls?: string[];
    videoUrl?: string | null;
    title?: string | null;
    overrides?: Record<string, string>;
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

  const contentEdited =
    body.body !== undefined ||
    body.linkUrl !== undefined ||
    body.imageUrl !== undefined ||
    body.imageUrls !== undefined ||
    body.videoUrl !== undefined ||
    body.title !== undefined ||
    body.overrides !== undefined;
  // Published content is immutable — what went out is the record of what went out.
  if (contentEdited && post.status === 'published') {
    return NextResponse.json({ error: 'Published posts can no longer be edited.' }, { status: 409 });
  }

  const values: Partial<typeof adsPosts.$inferInsert> = { updatedAt: new Date() };
  if (body.body !== undefined) values.body = body.body.trim();
  if (body.linkUrl !== undefined) values.linkUrl = body.linkUrl?.trim() || null;
  if (body.videoUrl !== undefined) values.videoUrl = body.videoUrl?.trim() || null;
  if (body.title !== undefined) values.title = body.title?.trim() || null;
  if (body.imageUrls !== undefined) {
    const imageUrls = Array.isArray(body.imageUrls)
      ? [...new Set(body.imageUrls.map((u) => String(u).trim()).filter(Boolean))].slice(0, 10)
      : [];
    values.imageUrls = imageUrls;
    values.imageUrl = imageUrls[0] ?? null;
  } else if (body.imageUrl !== undefined) {
    values.imageUrl = body.imageUrl?.trim() || null;
  }
  if (body.action === 'unschedule') {
    values.status = 'draft';
    values.scheduledAt = null;
  } else if (body.scheduledAt !== undefined) {
    values.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    values.status = body.scheduledAt ? 'scheduled' : 'draft';
  }

  const targets = await db
    .select({ id: adsPostTargets.id, accountId: adsPostTargets.accountId, platform: adsPostTargets.platform })
    .from(adsPostTargets)
    .where(eq(adsPostTargets.postId, id));

  if (contentEdited) {
    // Re-validate the merged draft against every target platform, like create does.
    const merged = {
      body: values.body ?? post.body,
      linkUrl: values.linkUrl !== undefined ? values.linkUrl : post.linkUrl,
      imageUrl: values.imageUrl !== undefined ? values.imageUrl : post.imageUrl,
      videoUrl: values.videoUrl !== undefined ? values.videoUrl : post.videoUrl,
      title: values.title !== undefined ? values.title : post.title,
    };
    const problems = [...new Set(targets.map((t) => t.platform))].flatMap((p) =>
      blockingProblems(merged, p as SocialPlatform),
    );
    if (problems.length) {
      return NextResponse.json({ error: problems.join(' · ') }, { status: 400 });
    }

    // Approval workflow: a non-admin editing content sends it back for review.
    const settings = await getSettings();
    if (settings.requireApproval && !isAdmin(session)) {
      values.approvalStatus = 'pending';
      values.approvedBy = null;
      values.approvedAt = null;
    }
  }

  const [updated] = await db.update(adsPosts).set(values).where(eq(adsPosts.id, id)).returning();

  // Per-network caption overrides, keyed by accountId (API targets) or platform (manual targets).
  // Only stored when they differ from the (new) base body; empty/equal clears the override.
  if (body.overrides && typeof body.overrides === 'object') {
    const finalBody = updated?.body ?? post.body;
    for (const target of targets) {
      const key = target.accountId ?? target.platform;
      if (!(key in body.overrides)) continue;
      const raw = body.overrides[key]?.trim() ?? '';
      const bodyOverride = raw && raw !== finalBody ? raw.slice(0, 5000) : null;
      await db
        .update(adsPostTargets)
        .set({ bodyOverride, updatedAt: new Date() })
        .where(eq(adsPostTargets.id, target.id));
    }
  }

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
