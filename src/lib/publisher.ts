import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { adsPostTargets, adsPosts, adsSocialAccounts, getDb } from '@/db';
import { publishToFacebook, publishToInstagram } from './social/meta';

const MAX_ATTEMPTS = 3;

type Target = typeof adsPostTargets.$inferSelect;
type Post = typeof adsPosts.$inferSelect;

async function publishTarget(post: Post, target: Target): Promise<void> {
  const db = getDb();
  const [account] = target.accountId
    ? await db.select().from(adsSocialAccounts).where(eq(adsSocialAccounts.id, target.accountId)).limit(1)
    : [];
  try {
    if (!account) throw new Error('Connected account not found — it may have been disconnected');
    const input = { body: post.body, linkUrl: post.linkUrl, imageUrl: post.imageUrl };
    const result =
      target.platform === 'facebook'
        ? await publishToFacebook(account, input)
        : target.platform === 'instagram'
          ? await publishToInstagram(account, input)
          : (() => {
              throw new Error(`API publishing for ${target.platform} is not available yet`);
            })();

    await db
      .update(adsPostTargets)
      .set({
        status: 'published',
        platformPostId: result.platformPostId,
        platformUrl: result.platformUrl,
        error: null,
        publishedAt: new Date(),
        attemptCount: target.attemptCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(adsPostTargets.id, target.id));
  } catch (err) {
    await db
      .update(adsPostTargets)
      .set({
        status: 'failed',
        error: (err as Error).message.slice(0, 1000),
        attemptCount: target.attemptCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(adsPostTargets.id, target.id));
  }
}

/**
 * Recompute a post's rollup status from its targets.
 * - retryable API failures put the post back to `scheduled` (the next cron run retries);
 * - outstanding manual-export targets hold the post at `partial`;
 * - everything published (API + manual done) → `published`.
 */
export async function recomputePostStatus(postId: string): Promise<string> {
  const db = getDb();
  const targets = await db.select().from(adsPostTargets).where(eq(adsPostTargets.postId, postId));

  const retryable = targets.some((t) => t.status === 'failed' && t.attemptCount < MAX_ATTEMPTS);
  const exhaustedFailures = targets.some((t) => t.status === 'failed' && t.attemptCount >= MAX_ATTEMPTS);
  const manualPending = targets.some((t) => t.status === 'manual');
  const published = targets.filter((t) => t.status === 'published' || t.status === 'manual_done').length;
  const allDone = published === targets.length && targets.length > 0;

  let status: string;
  if (retryable) status = 'scheduled';
  else if (allDone) status = 'published';
  else if (published > 0 || manualPending) status = exhaustedFailures || manualPending ? 'partial' : 'published';
  else status = 'failed';

  await db
    .update(adsPosts)
    .set({
      status,
      publishedAt: status === 'published' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(adsPosts.id, postId));
  return status;
}

async function processPost(post: Post): Promise<void> {
  const db = getDb();
  const targets = await db
    .select()
    .from(adsPostTargets)
    .where(
      and(
        eq(adsPostTargets.postId, post.id),
        inArray(adsPostTargets.status, ['pending', 'failed']),
      ),
    );

  for (const target of targets) {
    if (target.status === 'failed' && target.attemptCount >= MAX_ATTEMPTS) continue;
    if (target.accountId === null) continue; // manual-export targets are completed by a human
    await publishTarget(post, target);
  }
  await recomputePostStatus(post.id);
}

/** Claim due posts (SKIP LOCKED so concurrent cron invocations never double-publish) and publish them. */
export async function publishDuePosts(limit = 5): Promise<{ processed: string[] }> {
  const db = getDb();
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(adsPosts)
      .where(and(eq(adsPosts.status, 'scheduled'), lte(adsPosts.scheduledAt, new Date())))
      .orderBy(adsPosts.scheduledAt)
      .limit(limit)
      .for('update', { skipLocked: true });
    if (rows.length) {
      await tx
        .update(adsPosts)
        .set({ status: 'publishing', updatedAt: new Date() })
        .where(inArray(adsPosts.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  for (const post of claimed) {
    await processPost(post);
  }
  return { processed: claimed.map((p) => p.id) };
}

/** Immediate publish of one post (the composer's "Publish now"). */
export async function publishPostNow(postId: string): Promise<string> {
  const db = getDb();
  const [post] = await db
    .update(adsPosts)
    .set({ status: 'publishing', scheduledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(adsPosts.id, postId), sql`${adsPosts.status} in ('draft','scheduled','failed','partial')`))
    .returning();
  if (!post) throw new Error('Post is not in a publishable state');
  await processPost(post);
  return recomputePostStatus(postId);
}
