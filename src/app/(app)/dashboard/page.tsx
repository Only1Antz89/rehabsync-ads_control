import { CalendarDays, PenSquare, Plug, TrendingUp } from 'lucide-react';
import { and, eq, gte, sql } from 'drizzle-orm';
import { adsPosts, adsSocialAccounts, getDb } from '@/db';
import { getSession } from '@/lib/auth';
import { Badge, Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

async function loadCounts(): Promise<{ accounts: number; scheduled: number; publishedThisMonth: number }> {
  try {
    const db = getDb();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [accounts, posts] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(adsSocialAccounts)
        .where(eq(adsSocialAccounts.status, 'connected')),
      db
        .select({
          scheduled: sql<number>`count(*) filter (where ${adsPosts.status} = 'scheduled')::int`,
          publishedThisMonth: sql<number>`count(*) filter (where ${and(eq(adsPosts.status, 'published'), gte(adsPosts.publishedAt, monthStart))})::int`,
        })
        .from(adsPosts),
    ]);
    return {
      accounts: accounts[0]?.count ?? 0,
      scheduled: posts[0]?.scheduled ?? 0,
      publishedThisMonth: posts[0]?.publishedThisMonth ?? 0,
    };
  } catch {
    return { accounts: 0, scheduled: 0, publishedThisMonth: 0 };
  }
}

export default async function DashboardPage() {
  const [session, counts] = await Promise.all([getSession(), loadCounts()]);
  const firstName = (session?.name ?? '').split(' ')[0] || 'there';
  const isAdmin = session?.role === 'admin' || session?.role === 'super_admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Welcome back, {firstName}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Your social publishing hub.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Connected accounts
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            {counts.accounts}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Scheduled posts
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--brand-primary)' }}>
            {counts.scheduled}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Published this month
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            {counts.publishedThisMonth}
          </p>
        </Card>
      </div>

      <Card
        title="Getting started"
        description="What happens next as the milestones land — see BUILD_PLAN.md in the repo."
      >
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <Plug size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Connect social accounts <Badge variant="info">M1</Badge>
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Meta (Facebook Pages + Instagram Business) first{isAdmin ? ' — admin-only, under Connections' : ''};
                LinkedIn, TikTok and YouTube follow. Every platform works via manual-export until connected.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <PenSquare size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Compose once, publish everywhere <Badge variant="info">M1</Badge>
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Per-platform previews and validation, media uploads, schedule or publish now.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <CalendarDays size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Content calendar <Badge variant="info">M1</Badge>
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Month and week views with drag-to-reschedule; a cron worker publishes due posts.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <TrendingUp size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Engagement analytics <Badge variant="info">M2</Badge> · Newsletters <Badge variant="info">M3</Badge>
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Impressions, reach and follower growth per platform; consent-based newsletters via
                SMTP2GO with double opt-in — see Subscribers and Newsletters. TikTok/YouTube video
                publishing lands in M4.
              </p>
            </div>
          </li>
        </ul>
      </Card>
    </div>
  );
}
