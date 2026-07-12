'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui';

interface Analytics {
  totals: { threads: number; open: number; pending: number; closed: number; spam: number; unread: number };
  byPlatform: { platform: string; count: number }[];
  byKind: { kind: string; count: number }[];
  replyRatePct: number;
  avgFirstResponseMins: number | null;
  byAssignee: { assignee: string; open: number }[];
  weekly: { day: string; inbound: number }[];
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 && value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--brand-primary)' }} />
    </div>
  );
}

function fmtDur(mins: number | null): string {
  if (mins === null) return '—';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function InboxAnalyticsClient() {
  const [data, setData] = useState<Analytics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/inbox/analytics')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((d: Analytics) => setData(d))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>Could not load insights.</p>;
  if (!data) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  const platMax = Math.max(...data.byPlatform.map((p) => p.count), 1);
  const kindMax = Math.max(...data.byKind.map((k) => k.count), 1);
  const weekMax = Math.max(...data.weekly.map((w) => w.inbound), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(
          [
            ['Conversations', String(data.totals.threads)],
            ['Open', String(data.totals.open)],
            ['Reply rate', `${data.replyRatePct}%`],
            ['Avg response', fmtDur(data.avgFirstResponseMins)],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{value}</p>
          </Card>
        ))}
      </div>

      <Card title="Last 7 days" description="Inbound messages per day.">
        <div className="flex items-end gap-2 h-32">
          {data.weekly.map((w) => (
            <div key={w.day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{w.inbound}</span>
              <div className="w-full rounded-t" style={{ height: `${Math.max(4, Math.round((w.inbound / weekMax) * 88))}px`, backgroundColor: w.inbound > 0 ? 'var(--brand-primary)' : 'var(--bg-tertiary)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {new Date(`${w.day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="By network">
          {data.byPlatform.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No conversations yet.</p>
          ) : (
            <div className="space-y-3">
              {data.byPlatform.map((p) => (
                <div key={p.platform}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span style={{ color: 'var(--text-primary)' }}>{PLATFORM_LABELS[p.platform] ?? p.platform}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{p.count}</span>
                  </div>
                  <Bar value={p.count} max={platMax} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="By type">
          {data.byKind.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No conversations yet.</p>
          ) : (
            <div className="space-y-3">
              {data.byKind.map((k) => (
                <div key={k.kind}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="capitalize" style={{ color: 'var(--text-primary)' }}>{k.kind}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{k.count}</span>
                  </div>
                  <Bar value={k.count} max={kindMax} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Open by assignee">
        {data.byAssignee.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing assigned yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                <th className="py-1.5">Assignee</th>
                <th className="py-1.5 text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {data.byAssignee.map((a) => (
                <tr key={a.assignee} className="border-t" style={{ borderColor: 'var(--border-secondary)' }}>
                  <td className="py-2" style={{ color: 'var(--text-primary)' }}>{a.assignee}</td>
                  <td className="py-2 text-right" style={{ color: 'var(--text-primary)' }}>{a.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
