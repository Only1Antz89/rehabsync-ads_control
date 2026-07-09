'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface SubscriberRow {
  id: string;
  email: string;
  name: string | null;
  status: string;
  tags: string[];
  consentSource: string;
  consentAt: string | null;
  createdAt: string;
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  active: 'success',
  pending: 'info',
  unsubscribed: 'neutral',
  bounced: 'error',
};

export function SubscribersManager() {
  const [rows, setRows] = useState<SubscriberRow[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<'add' | 'import' | null>(null);
  const [busy, setBusy] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newConsent, setNewConsent] = useState('');

  const [csv, setCsv] = useState('');
  const [importConsent, setImportConsent] = useState('');
  const [importTags, setImportTags] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    fetch(`/api/subscribers?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { subscribers: SubscriberRow[] }) => setRows(d.subscribers))
      .catch(() => setError('Could not load subscribers.'));
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search
    return () => clearTimeout(t);
  }, [load]);

  function tagsFrom(input: string): string[] {
    return input.split(',').map((t) => t.trim()).filter(Boolean);
  }

  async function addSubscriber(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, name: newName, tags: tagsFrom(newTags), consentSource: newConsent }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Could not add subscriber.');
        return;
      }
      setNewEmail('');
      setNewName('');
      setNewTags('');
      setNewConsent('');
      setPanel(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/subscribers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, consentSource: importConsent, tags: tagsFrom(importTags) }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; imported?: number; skipped?: number }
        | null;
      if (!res.ok) {
        setError(body?.error ?? 'Import failed.');
        return;
      }
      setNotice(`Imported ${body?.imported ?? 0} subscriber(s), skipped ${body?.skipped ?? 0} (invalid, duplicate or suppressed).`);
      setCsv('');
      setImportConsent('');
      setImportTags('');
      setPanel(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function act(row: SubscriberRow, action: 'unsubscribe' | 'delete') {
    const message =
      action === 'unsubscribe'
        ? `Unsubscribe ${row.email}? They stop receiving newsletters immediately.`
        : `Delete ${row.email} entirely? The suppression record (if any) is kept so their opt-out is still honoured.`;
    if (!window.confirm(message)) return;
    setError(null);
    const res =
      action === 'unsubscribe'
        ? await fetch(`/api/subscribers/${row.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unsubscribe' }),
          })
        : await fetch(`/api/subscribers/${row.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Action failed.');
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-56">
          <Input placeholder="Search email or name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending confirmation</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
        </select>
        <Button onClick={() => setPanel(panel === 'add' ? null : 'add')}>
          <Plus size={14} className="mr-1" /> Add
        </Button>
        <Button variant="secondary" onClick={() => setPanel(panel === 'import' ? null : 'import')}>
          <Upload size={14} className="mr-1" /> Import CSV
        </Button>
      </div>

      {panel === 'add' && (
        <Card
          title="Add a subscriber"
          description="For consent you already hold (verbal, event sign-up…). Record where it came from — the list is consent-based only."
        >
          <form onSubmit={addSubscriber} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            <Input label="Name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input label="Tags (comma separated)" value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="clinics, north" />
            <Input
              label="Consent source"
              value={newConsent}
              onChange={(e) => setNewConsent(e.target.value)}
              required
              placeholder="e.g. Physio Expo 2026 sign-up sheet"
            />
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" loading={busy}>Add subscriber</Button>
              <Button type="button" variant="secondary" onClick={() => setPanel(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {panel === 'import' && (
        <Card
          title="Import CSV"
          description="One `email,name` per line. Purchased lists are never allowed; suppressed and existing addresses are skipped."
        >
          <form onSubmit={importCsv} className="space-y-3">
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={6}
              required
              placeholder={'jane@clinic.co.uk,Jane Doe\nsam@physio.org'}
              className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Consent source"
                value={importConsent}
                onChange={(e) => setImportConsent(e.target.value)}
                required
                placeholder="e.g. existing customers — contract clause 7"
              />
              <Input label="Tags (comma separated)" value={importTags} onChange={(e) => setImportTags(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>Import</Button>
              <Button type="button" variant="secondary" onClick={() => setPanel(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
      {notice && <p className="text-sm" style={{ color: 'var(--color-success-text)' }}>{notice}</p>}

      {rows === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No subscribers match. Share <code>/n/subscribe</code> to start growing the list.
          </p>
        </Card>
      ) : (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-xs uppercase tracking-wide border-b"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border-primary)' }}
              >
                <th className="px-4 py-3">Subscriber</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Consent</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-secondary)' }}>
                  <td className="px-4 py-3">
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.email}</p>
                    {row.name && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.name}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANTS[row.status] ?? 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {row.tags.length ? row.tags.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    <span className="block max-w-48 truncate">{row.consentSource}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {row.consentAt
                        ? new Date(row.consentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'not confirmed'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {row.status === 'active' && (
                      <Button variant="ghost" size="sm" onClick={() => void act(row, 'unsubscribe')}>
                        Unsubscribe
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => void act(row, 'delete')}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
