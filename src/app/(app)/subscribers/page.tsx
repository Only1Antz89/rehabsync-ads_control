import { gte, sql } from 'drizzle-orm';
import { adsSubscribers, getDb } from '@/db';
import { Card } from '@/components/ui';
import { SubscribersManager } from './SubscribersManager';

export const dynamic = 'force-dynamic';

interface GrowthWeek {
  week: string;
  count: number;
}

function isoWeekStartUTC(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

async function loadGrowth(): Promise<{ total: number; active: number; weekly: GrowthWeek[] }> {
  try {
    const db = getDb();
    const since8w = new Date(Date.now() - 8 * 7 * 86400000);
    const weekExpr = sql<string>`(date_trunc('week', ${adsSubscribers.createdAt}))::date::text`;

    const [totals, weeklyRes] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${adsSubscribers.status} = 'active')::int`,
        })
        .from(adsSubscribers),
      db
        .select({ week: weekExpr, count: sql<number>`count(*)::int` })
        .from(adsSubscribers)
        .where(gte(adsSubscribers.createdAt, since8w))
        .groupBy(weekExpr)
        .orderBy(weekExpr),
    ]);

    const byWeek = new Map(weeklyRes.map((r) => [r.week, r.count]));
    const weekly: GrowthWeek[] = [];
    for (let i = 7; i >= 0; i -= 1) {
      const key = isoWeekStartUTC(new Date(Date.now() - i * 7 * 86400000));
      weekly.push({ week: key, count: byWeek.get(key) ?? 0 });
    }
    return { total: totals[0]?.total ?? 0, active: totals[0]?.active ?? 0, weekly };
  } catch {
    return { total: 0, active: 0, weekly: [] };
  }
}

export default async function SubscribersPage() {
  const growth = await loadGrowth();
  const max = Math.max(...growth.weekly.map((w) => w.count), 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Subscribers
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Consent-based newsletter list — {growth.active} active of {growth.total} total. Public
          signups land at <code>/n/subscribe</code> and double-opt-in before they count.
        </p>
      </div>

      {growth.weekly.length > 0 && (
        <Card title="List growth" description="New signups per week (last 8 ISO weeks).">
          <div className="flex items-end gap-2 h-24">
            {growth.weekly.map((w) => (
              <div key={w.week} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {w.count}
                </span>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(4, Math.round((w.count / max) * 60))}px`,
                    backgroundColor: w.count > 0 ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                  }}
                />
                <span className="text-[10px] truncate w-full text-center" style={{ color: 'var(--text-muted)' }}>
                  {new Date(`${w.week}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <SubscribersManager />
    </div>
  );
}
