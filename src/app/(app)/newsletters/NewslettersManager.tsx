'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface NewsletterRow {
  id: string;
  name: string;
  subject: string;
  status: string;
  segment: { tags?: string[] };
  scheduledAt: string | null;
  sentAt: string | null;
  recipients: number;
}

interface Report {
  newsletter: { id: string; name: string; status: string };
  recipients: { total: number; sent: number; failed: number; suppressed: number; pending: number };
  events: Record<string, number>;
}

function statusVariant(status: string): BadgeVariant {
  if (status === 'sent') return 'success';
  if (status === 'cancelled') return 'error';
  if (status === 'sending' || status === 'scheduled') return 'info';
  return 'neutral';
}

export function NewslettersManager({ isAdmin }: { isAdmin: boolean }) {
  const [issues, setIssues] = useState<NewsletterRow[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Composer state
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState(
    '<p>Hi {{first_name}},</p>\n<p>…</p>\n<p style="font-size:12px;color:#64748b"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  );
  const [tagsCsv, setTagsCsv] = useState('');
  const [audience, setAudience] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch('/api/newsletters')
      .then((res) => (res.ok ? res.json() : { newsletters: [] }))
      .then((d: { newsletters: NewsletterRow[] }) => setIssues(d.newsletters))
      .catch(() => setIssues([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const segment = useCallback(() => {
    const tags = tagsCsv.split(',').map((t) => t.trim()).filter(Boolean);
    return tags.length ? { tags } : {};
  }, [tagsCsv]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch('/api/newsletters/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment: segment() }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((d: { count: number } | null) => setAudience(d?.count ?? null))
        .catch(() => setAudience(null));
    }, 300);
    return () => clearTimeout(t);
  }, [segment]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError(null);
    try {
      const res = await fetch('/api/newsletters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, html, segment: segment() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Create failed.');
        return;
      }
      setName('');
      setSubject('');
      setTagsCsv('');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, action: 'send_now' | 'cancel' | 'schedule', scheduledAt?: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/newsletters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduledAt ? { action, scheduledAt } : { action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Action failed.');
      }
      load();
      if (report?.newsletter.id === id) void openReport(id);
    } finally {
      setBusy(null);
    }
  }

  function schedule(id: string) {
    const input = window.prompt('Send at (YYYY-MM-DD HH:MM, local time):');
    if (!input) return;
    const when = new Date(input.replace(' ', 'T'));
    if (Number.isNaN(when.getTime())) {
      setError('Could not parse that time.');
      return;
    }
    void act(id, 'schedule', when.toISOString());
  }

  async function testSend(id: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/newsletters/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) setError(data?.error ?? 'Test send failed.');
      else setNotice('Test email sent to your address.');
    } finally {
      setBusy(null);
    }
  }

  async function openReport(id: string) {
    const res = await fetch(`/api/newsletters/${id}`);
    if (res.ok) setReport((await res.json()) as Report);
  }

  return (
    <div className="space-y-5">
      <Card
        title="New issue"
        description="Merge tags: {{name}}, {{first_name}}, {{email}}, {{unsubscribe_url}}. A compliance footer with unsubscribe is added automatically if you leave {{unsubscribe_url}} out."
      >
        <form onSubmit={create} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Internal name" value={name} onChange={(e) => setName(e.target.value)} placeholder="July 2026 issue" required />
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's new in RehabSync" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              HTML body
            </label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={8}
              className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
          </div>
          <Input
            label="Audience tags (comma separated, empty = all active subscribers)"
            value={tagsCsv}
            onChange={(e) => setTagsCsv(e.target.value)}
            placeholder="clinics, north"
          />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Audience: <strong style={{ color: 'var(--text-primary)' }}>{audience ?? '…'}</strong> active subscriber{audience === 1 ? '' : 's'} after suppressions.
          </p>
          {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
          {notice && <p className="text-sm" style={{ color: 'var(--color-success-text)' }}>{notice}</p>}
          <Button type="submit" loading={busy === 'create'}>Create draft</Button>
        </form>
      </Card>

      <Card title="Issues">
        {issues === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : issues.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No newsletters yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            {issues.map((issue) => (
              <li key={issue.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => void openReport(issue.id)} className="text-left min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{issue.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {issue.subject}
                    {issue.segment.tags?.length ? ` · tags: ${issue.segment.tags.join(', ')}` : ' · all subscribers'}
                    {issue.recipients > 0 ? ` · ${issue.recipients} recipient${issue.recipients === 1 ? '' : 's'}` : ''}
                    {issue.sentAt
                      ? ` · sent ${new Date(issue.sentAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                      : issue.scheduledAt
                        ? ` · scheduled ${new Date(issue.scheduledAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(issue.status)}>{issue.status}</Badge>
                  <Button size="sm" variant="ghost" disabled={busy === issue.id} onClick={() => void testSend(issue.id)}>
                    Test
                  </Button>
                  {isAdmin && issue.status === 'draft' && (
                    <Button size="sm" variant="secondary" disabled={busy === issue.id} onClick={() => schedule(issue.id)}>
                      Schedule
                    </Button>
                  )}
                  {isAdmin && (issue.status === 'draft' || issue.status === 'scheduled') && (
                    <Button size="sm" disabled={busy === issue.id} onClick={() => void act(issue.id, 'send_now')}>
                      Send now
                    </Button>
                  )}
                  {isAdmin && (issue.status === 'scheduled' || issue.status === 'sending') && (
                    <Button size="sm" variant="secondary" disabled={busy === issue.id} onClick={() => void act(issue.id, 'cancel')}>
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isAdmin && (
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            You can draft and test-send; scheduling and sending need an admin.
          </p>
        )}
      </Card>

      {report && (
        <Card title={`Report: ${report.newsletter.name}`} description="Delivery and engagement (unique recipients per event).">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              ['Recipients', report.recipients.total],
              ['Sent', report.recipients.sent],
              ['Delivered', report.events['delivered'] ?? 0],
              ['Opened', report.events['open'] ?? 0],
              ['Clicked', report.events['click'] ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3 text-center" style={{ borderColor: 'var(--border-primary)' }}>
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Failed: {report.recipients.failed} · Suppressed: {report.recipients.suppressed} · Pending: {report.recipients.pending} · Unsubscribed: {report.events['unsub'] ?? 0} · Bounced: {report.events['bounce'] ?? 0}
          </p>
        </Card>
      )}
    </div>
  );
}
