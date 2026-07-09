import { CalendarDays, PenSquare, Plug, TrendingUp } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { Badge, Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getSession();
  const firstName = (session?.name ?? '').split(' ')[0] || 'there';
  const isAdmin = session?.role === 'admin' || session?.role === 'super_admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Welcome back, {firstName}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Your social publishing hub. Foundations are live — publishing lands in M1.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Connected accounts
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            0
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Scheduled posts
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--brand-primary)' }}>
            0
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Published this month
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            0
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
                Engagement analytics <Badge variant="neutral">M2</Badge> · Newsletters <Badge variant="neutral">M3</Badge>
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Impressions, reach and follower growth per platform; consent-based newsletters via SMTP2GO.
              </p>
            </div>
          </li>
        </ul>
      </Card>
    </div>
  );
}
