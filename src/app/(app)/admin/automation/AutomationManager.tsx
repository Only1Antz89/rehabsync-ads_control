'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface CronJob {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastDetail: Record<string, unknown> | null;
}

function statusVariant(status: string | null): BadgeVariant {
  if (status === 'ok') return 'success';
  if (status === 'error') return 'error';
  if (status === 'skipped') return 'warning';
  return 'neutral';
}

function fmt(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function detailText(detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  return Object.entries(detail)
    .map(([k, v]) => {
      if (typeof v === 'number' || typeof v === 'string') return `${k}: ${v}`;
      if (Array.isArray(v)) return `${k}: ${v.length}`;
      return null;
    })
    .filter(Boolean)
    .join(' · ');
}

export function AutomationManager() {
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/admin/cron')
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((d: { jobs: CronJob[] }) => setJobs(d.jobs))
      .catch(() => setJobs([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(job: CronJob) {
    setBusy(job.key);
    setNotice(null);
    try {
      await fetch(`/api/admin/cron/${job.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function runNow(job: CronJob) {
    setBusy(`run:${job.key}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/cron/${job.key}/run`, { method: 'POST' });
      const d = (await res.json().catch(() => null)) as { detail?: Record<string, unknown>; error?: string } | null;
      setNotice(res.ok ? `${job.label} ran — ${detailText(d?.detail ?? null) || 'done'}.` : `${job.label} failed: ${d?.error ?? 'error'}`);
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {notice && (
        <p className="rounded-lg border-l-4 p-3 text-sm" style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {notice}
        </p>
      )}

      {jobs === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : (
        jobs.map((job) => (
          <Card key={job.key}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{job.label}</h3>
                  <Badge variant={job.enabled ? 'success' : 'neutral'}>{job.enabled ? 'active' : 'paused'}</Badge>
                </div>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{job.description}</p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  Last run {fmt(job.lastRunAt)}
                  {job.lastStatus ? (
                    <>
                      {' · '}
                      <span style={{ color: statusVariant(job.lastStatus) === 'error' ? 'var(--color-error-text)' : 'var(--text-muted)' }}>{job.lastStatus}</span>
                    </>
                  ) : ''}
                  {detailText(job.lastDetail) ? ` · ${detailText(job.lastDetail)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="secondary" disabled={busy === `run:${job.key}`} onClick={() => void runNow(job)}>
                  <Play size={14} className="mr-1" /> Run now
                </Button>
                <Button size="sm" variant={job.enabled ? 'danger' : 'primary'} disabled={busy === job.key} onClick={() => void toggle(job)}>
                  {job.enabled ? 'Pause' : 'Resume'}
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Jobs are triggered by the external cron service (Railway). Pausing a job here stops its work
        immediately without touching the scheduler — the safe way to hold automation and control spend.
        “Run now” executes a job once regardless of its paused state.
      </p>
    </div>
  );
}
