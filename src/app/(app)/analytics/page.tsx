import { desc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { adsAccountMetrics, adsSocialAccounts, getDb } from '@/db';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

interface PlatformRow {
  platform: string;
  posts: number;
  impressions: number;
  reach: number;
  engagement: number;
}

interface TopPost {
  body: string;
  platform: string;
  impressions: number;
  engagement: number;
}

interface FollowerRow {
  accountId: string;
  displayName: string;
  platform: string;
  latest: number;
  previous: number;
}

interface AnalyticsData {
  totals: { posts: number; impressions: number; reach: number; engagement: number };
  byPlatform: PlatformRow[];
  topPosts: TopPost[];
  followers: FollowerRow[];
  dbError: boolean;
}

async function loadAnalytics(): Promise<AnalyticsData> {
  try {
    const db = getDb();
    // Raw-SQL execute can't bind a JS Date through postgres.js — bind ISO text and cast instead.
    const since = new Date(Date.now() - 30 * 86400000).toISOString();

    // Aggregate the LATEST snapshot per published target.
    const byPlatformRes = await db.execute(sql`
      select t.platform,
             count(distinct t.id)::int as posts,
             coalesce(sum(m.impressions),0)::int as impressions,
             coalesce(sum(m.reach),0)::int as reach,
             coalesce(sum(m.likes + m.comments + m.shares + m.clicks),0)::int as engagement
      from ads_post_targets t
      join (
        select distinct on (target_id) target_id, impressions, reach, likes, comments, shares, clicks
        from ads_post_metrics order by target_id, captured_at desc
      ) m on m.target_id = t.id
      where t.status = 'published' and t.published_at >= ${since}::timestamp
      group by t.platform
      order by impressions desc`);
    const byPlatform = [...byPlatformRes].map((r) => {
      const row = r as Record<string, unknown>;
      return {
        platform: String(row['platform']),
        posts: Number(row['posts'] ?? 0),
        impressions: Number(row['impressions'] ?? 0),
        reach: Number(row['reach'] ?? 0),
        engagement: Number(row['engagement'] ?? 0),
      };
    });

    const topPostsRes = await db.execute(sql`
      select p.body, t.platform,
             m.impressions::int as impressions,
             (m.likes + m.comments + m.shares + m.clicks)::int as engagement
      from ads_post_targets t
      join (
        select distinct on (target_id) target_id, impressions, likes, comments, shares, clicks
        from ads_post_metrics order by target_id, captured_at desc
      ) m on m.target_id = t.id
      join ads_posts p on p.id = t.post_id
      where t.status = 'published'
      order by engagement desc, impressions desc
      limit 8`);
    const topPosts = [...topPostsRes].map((r) => {
      const row = r as Record<string, unknown>;
      return {
        body: String(row['body'] ?? ''),
        platform: String(row['platform']),
        impressions: Number(row['impressions'] ?? 0),
        engagement: Number(row['engagement'] ?? 0),
      };
    });

    const totals = byPlatform.reduce(
      (acc, row) => ({
        posts: acc.posts + row.posts,
        impressions: acc.impressions + row.impressions,
        reach: acc.reach + row.reach,
        engagement: acc.engagement + row.engagement,
      }),
      { posts: 0, impressions: 0, reach: 0, engagement: 0 },
    );

    const accounts = await db
      .select({
        id: adsSocialAccounts.id,
        displayName: adsSocialAccounts.displayName,
        platform: adsSocialAccounts.platform,
      })
      .from(adsSocialAccounts)
      .where(eq(adsSocialAccounts.status, 'connected'));

    const followers: FollowerRow[] = [];
    for (const account of accounts) {
      const rows = await db
        .select({ followers: adsAccountMetrics.followers })
        .from(adsAccountMetrics)
        .where(eq(adsAccountMetrics.accountId, account.id))
        .orderBy(desc(adsAccountMetrics.date))
        .limit(31);
      if (rows.length === 0) continue;
      followers.push({
        accountId: account.id,
        displayName: account.displayName,
        platform: account.platform,
        latest: rows[0]?.followers ?? 0,
        previous: rows[rows.length - 1]?.followers ?? rows[0]?.followers ?? 0,
      });
    }

    return { totals, byPlatform, topPosts, followers, dbError: false };
  } catch (err) {
    console.error('[analytics] load failed', err);
    return {
      totals: { posts: 0, impressions: 0, reach: 0, engagement: 0 },
      byPlatform: [],
      topPosts: [],
      followers: [],
      dbError: true,
    };
  }
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--brand-primary)' }} />
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n);
}

export default async function AnalyticsPage() {
  const data = await loadAnalytics();
  const maxImpressions = Math.max(...data.byPlatform.map((r) => r.impressions), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Analytics
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Engagement across connected platforms — snapshots refresh hourly via the metrics sync.
        </p>
      </div>

      {data.dbError && (
        <p
          className="rounded-lg border-l-4 p-3 text-sm"
          style={{ borderColor: 'var(--color-warning)', backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}
        >
          Could not reach the database — showing empty metrics.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(
          [
            ['Published posts (30d)', data.totals.posts],
            ['Impressions', data.totals.impressions],
            ['Reach', data.totals.reach],
            ['Engagements', data.totals.engagement],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              {label}
            </p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
              {fmt(value)}
            </p>
          </Card>
        ))}
      </div>

      <Card title="By platform (last 30 days)">
        {data.byPlatform.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No published posts with metrics yet — publish something and the hourly sync will populate this.
          </p>
        ) : (
          <div className="space-y-3">
            {data.byPlatform.map((row) => (
              <div key={row.platform}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                    {row.platform}{' '}
                    <span style={{ color: 'var(--text-muted)' }}>
                      · {row.posts} post{row.posts === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {fmt(row.impressions)} impressions · {fmt(row.engagement)} engagements
                  </span>
                </div>
                <Bar value={row.impressions} max={maxImpressions} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Top posts" description="By engagements (latest snapshot per platform target).">
          {data.topPosts.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nothing yet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
              {data.topPosts.map((post, i) => (
                <li key={i} className="py-2.5">
                  <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {post.body || '(no text)'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="capitalize">{post.platform}</span> · {fmt(post.engagement)} engagements ·{' '}
                    {fmt(post.impressions)} impressions
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Followers" description="Latest snapshot vs ~30 days ago.">
          {data.followers.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No account snapshots yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.followers.map((row) => {
                const delta = row.latest - row.previous;
                return (
                  <li key={row.accountId} className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--text-primary)' }}>
                      {row.displayName}{' '}
                      <span className="capitalize" style={{ color: 'var(--text-muted)' }}>
                        ({row.platform})
                      </span>
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {fmt(row.latest)}{' '}
                      <span style={{ color: delta >= 0 ? 'var(--color-success-text)' : 'var(--color-error-text)' }}>
                        ({delta >= 0 ? '+' : ''}
                        {fmt(delta)})
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
