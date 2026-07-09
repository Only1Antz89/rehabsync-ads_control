'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface AuditEntry {
  id: string;
  actorEmail: string;
  actorKind: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function actionVariant(action: string): BadgeVariant {
  if (action.includes('delete') || action.includes('removed') || action.includes('disabled')) return 'error';
  if (action.includes('created') || action.includes('added') || action.includes('invited')) return 'success';
  if (action.includes('suppress')) return 'warning';
  return 'neutral';
}

function metaSummary(metadata: Record<string, unknown>): string {
  const parts = Object.entries(metadata)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return parts.join(' · ');
}

export function AuditLogViewer() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback((query: string, offset: number, append: boolean) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (offset > 0) params.set('offset', String(offset));
    return fetch(`/api/admin/audit?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { entries: AuditEntry[]; hasMore: boolean }) => {
        setEntries((prev) => (append && prev ? [...prev, ...d.entries] : d.entries));
        setHasMore(d.hasMore);
      })
      .catch(() => setError('Could not load the audit log.'));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q, 0, false), 250); // debounce search
    return () => clearTimeout(t);
  }, [q, load]);

  async function loadMore() {
    if (!entries) return;
    setLoadingMore(true);
    try {
      await load(q, entries.length, true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <Input placeholder="Filter by actor, action or entity…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      {entries === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : entries.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No audit entries{q ? ' match your filter' : ' yet'}.
          </p>
        </Card>
      ) : (
        <>
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
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0 align-top" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(entry.createdAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                      {entry.actorEmail}
                      <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                        {entry.actorKind.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={actionVariant(entry.action)}>{entry.action.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                      {entry.entityType.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 max-w-md" style={{ color: 'var(--text-secondary)' }}>
                      <span className="break-words">{metaSummary(entry.metadata) || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
              Load more
            </Button>
          )}
        </>
      )}
    </div>
  );
}
