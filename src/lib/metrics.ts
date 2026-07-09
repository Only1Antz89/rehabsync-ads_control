import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  adsAccountMetrics,
  adsPostMetrics,
  adsPostTargets,
  adsSocialAccounts,
  getDb,
} from '@/db';
import {
  fetchAccountFollowers,
  fetchFacebookPostMetrics,
  fetchInstagramPostMetrics,
} from './social/meta';

const LOOKBACK_DAYS = 30;

/**
 * Pull engagement snapshots for recently-published API targets and a daily follower snapshot per
 * connected account. Tolerant by design: one account/post failing never aborts the run.
 */
export async function syncMetrics(): Promise<{ posts: number; accounts: number }> {
  const db = getDb();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);

  const targets = await db
    .select({
      id: adsPostTargets.id,
      platform: adsPostTargets.platform,
      platformPostId: adsPostTargets.platformPostId,
      accountId: adsPostTargets.accountId,
    })
    .from(adsPostTargets)
    .where(
      and(
        eq(adsPostTargets.status, 'published'),
        gte(adsPostTargets.publishedAt, since),
        inArray(adsPostTargets.platform, ['facebook', 'instagram']),
      ),
    );

  const accountIds = [...new Set(targets.map((t) => t.accountId).filter((id): id is string => Boolean(id)))];
  const accounts = await db
    .select()
    .from(adsSocialAccounts)
    .where(eq(adsSocialAccounts.status, 'connected'));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  let postSnapshots = 0;
  for (const target of targets) {
    const account = target.accountId ? accountById.get(target.accountId) : undefined;
    if (!account || !target.platformPostId) continue;
    try {
      const snapshot =
        target.platform === 'facebook'
          ? await fetchFacebookPostMetrics(account, target.platformPostId)
          : await fetchInstagramPostMetrics(account, target.platformPostId);
      if (!snapshot) continue;
      await db.insert(adsPostMetrics).values({
        targetId: target.id,
        impressions: snapshot.impressions,
        reach: snapshot.reach,
        likes: snapshot.likes,
        comments: snapshot.comments,
        shares: snapshot.shares,
        clicks: snapshot.clicks,
        videoViews: snapshot.videoViews,
        raw: snapshot.raw,
      });
      postSnapshots += 1;
    } catch (err) {
      console.error('[metrics] post sync failed', target.id, (err as Error).message);
    }
  }

  let accountSnapshots = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const account of accounts) {
    try {
      const snapshot = await fetchAccountFollowers(account);
      if (!snapshot) continue;
      await db
        .insert(adsAccountMetrics)
        .values({ accountId: account.id, date: today, followers: snapshot.followers, raw: snapshot.raw })
        .onConflictDoUpdate({
          target: [adsAccountMetrics.accountId, adsAccountMetrics.date],
          set: { followers: snapshot.followers, raw: snapshot.raw },
        });
      accountSnapshots += 1;
    } catch (err) {
      console.error('[metrics] account sync failed', account.id, (err as Error).message);
    }
  }

  void accountIds; // (kept for future per-account scoping)
  return { posts: postSnapshots, accounts: accountSnapshots };
}

/** Latest snapshot per target, for dashboard aggregation. */
export async function latestPostMetrics() {
  const db = getDb();
  return db
    .select({
      targetId: adsPostMetrics.targetId,
      impressions: adsPostMetrics.impressions,
      reach: adsPostMetrics.reach,
      likes: adsPostMetrics.likes,
      comments: adsPostMetrics.comments,
      shares: adsPostMetrics.shares,
      clicks: adsPostMetrics.clicks,
      capturedAt: adsPostMetrics.capturedAt,
    })
    .from(adsPostMetrics)
    .where(
      sql`${adsPostMetrics.id} in (
        select distinct on (target_id) id from ads_post_metrics order by target_id, captured_at desc
      )`,
    )
    .orderBy(desc(adsPostMetrics.capturedAt));
}
