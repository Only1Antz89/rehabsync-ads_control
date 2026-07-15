'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { RichTextEditor } from '@/components/RichTextEditor';

const DEFAULT_HTML =
  '<p>Hi {{first_name}},</p>\n<p>…</p>\n<p style="font-size:12px;color:#64748b"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>';

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
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [tagsCsv, setTagsCsv] = useState('');
  const [audience, setAudience] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Live rendered preview (uses the real send renderer via /api/newsletters/render)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    const t = setTimeout(() => {
      fetch('/api/newsletters/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((d: { subject: string; html: string } | null) => setPreview(d))
        .catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [subject, html]);

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

  function resetForm() {
    setEditingId(null);
    setName('');
    setSubject('');
    setHtml(DEFAULT_HTML);
    setTagsCsv('');
  }

  async function startEdit(id: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/newsletters/${id}`);
    if (!res.ok) {
      setError('Could not load that draft.');
      return;
    }
    const d = (await res.json()) as {
      newsletter: { id: string; name: string; subject: string; html: string; segment: { tags?: string[] } };
    };
    setEditingId(d.newsletter.id);
    setName(d.newsletter.name);
    setSubject(d.newsletter.subject);
    setHtml(d.newsletter.html ?? '');
    setTagsCsv((d.newsletter.segment?.tags ?? []).join(', '));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError(null);
    try {
      const res = await fetch(editingId ? `/api/newsletters/${editingId}` : '/api/newsletters', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, html, segment: segment() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Save failed.');
        return;
      }
      setNotice(editingId ? 'Draft updated.' : 'Draft created.');
      resetForm();
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <Card
          title={editingId ? 'Edit draft' : 'New issue'}
          description="Merge tags: {{name}}, {{first_name}}, {{email}}, {{unsubscribe_url}}. A compliance footer with unsubscribe is added automatically if you leave {{unsubscribe_url}} out."
        >
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Internal name" value={name} onChange={(e) => setName(e.target.value)} placeholder="July 2026 issue" required />
              <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's new in RehabSync" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Body
              </label>
              <RichTextEditor value={html} onChange={setHtml} />
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
            <div className="flex items-center gap-2">
              <Button type="submit" loading={busy === 'create'}>{editingId ? 'Save changes' : 'Create draft'}</Button>
              {editingId && (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </Card>

        <Card
          title="Preview"
          description="Rendered exactly as recipients will see it — sample subscriber, merge tags and compliance footer applied."
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm min-w-0 truncate pr-2" style={{ color: 'var(--text-primary)' }}>
              <span className="text-xs uppercase tracking-wide mr-2" style={{ color: 'var(--text-muted)' }}>Subject</span>
              <strong>{preview?.subject || '—'}</strong>
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setPreviewWidth('desktop')}
                title="Desktop width"
                className="p-1.5 rounded"
                style={{ color: previewWidth === 'desktop' ? 'var(--brand-primary)' : 'var(--text-muted)' }}
              >
                <Monitor size={15} />
              </button>
              <button
                type="button"
                onClick={() => setPreviewWidth('mobile')}
                title="Mobile width"
                className="p-1.5 rounded"
                style={{ color: previewWidth === 'mobile' ? 'var(--brand-primary)' : 'var(--text-muted)' }}
              >
                <Smartphone size={15} />
              </button>
            </div>
          </div>
          <div className="flex justify-center rounded-lg border p-3 overflow-x-auto" style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
            <iframe
              title="Newsletter preview"
              sandbox=""
              srcDoc={preview?.html ?? '<p style="font-family:sans-serif;color:#64748b;padding:16px">Start typing to see the preview…</p>'}
              className="rounded-md border-0 bg-white"
              style={{ width: previewWidth === 'desktop' ? 640 : 375, maxWidth: '100%', height: 460 }}
            />
          </div>
        </Card>
      </div>

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
                  {issue.status === 'draft' && (
                    <Button size="sm" variant="secondary" disabled={busy === issue.id} onClick={() => void startEdit(issue.id)}>
                      Edit
                    </Button>
                  )}
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
