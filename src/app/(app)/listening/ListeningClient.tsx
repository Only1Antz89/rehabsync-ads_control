'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { ENGAGE_PLATFORMS, engagePlatformLabel } from '@/lib/engage-platforms';

interface Stream {
  id: string;
  name: string;
  terms: string[];
  platforms: string[];
  active: boolean;
  mentions: number;
  fresh: number;
}

interface Mention {
  id: string;
  queryId: string | null;
  platform: string;
  authorName: string | null;
  authorHandle: string | null;
  permalink: string | null;
  content: string;
  sentiment: string;
  matchedTerm: string | null;
  status: string;
  createdAt: string;
}

interface Counts {
  positive: number;
  neutral: number;
  negative: number;
  fresh: number;
}

function sentimentVariant(s: string): BadgeVariant {
  if (s === 'positive') return 'success';
  if (s === 'negative') return 'error';
  return 'neutral';
}

const SENTIMENT_TABS = ['', 'positive', 'neutral', 'negative'] as const;

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ListeningClient() {
  const [streams, setStreams] = useState<Stream[] | null>(null);
  const [mentions, setMentions] = useState<Mention[] | null>(null);
  const [counts, setCounts] = useState<Counts>({ positive: 0, neutral: 0, negative: 0, fresh: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New stream
  const [name, setName] = useState('');
  const [termsCsv, setTermsCsv] = useState('');
  const [platforms, setPlatforms] = useState<Set<string>>(new Set());

  // Filters
  const [queryId, setQueryId] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [status, setStatus] = useState('new');
  const [q, setQ] = useState('');

  const loadStreams = useCallback(() => {
    fetch('/api/listening/queries')
      .then((r) => (r.ok ? r.json() : { queries: [] }))
      .then((d: { queries: Stream[] }) => setStreams(d.queries))
      .catch(() => setStreams([]));
  }, []);

  const loadMentions = useCallback(() => {
    const params = new URLSearchParams();
    if (queryId) params.set('queryId', queryId);
    if (sentiment) params.set('sentiment', sentiment);
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    fetch(`/api/listening/mentions?${params}`)
      .then((r) => (r.ok ? r.json() : { mentions: [], counts: { positive: 0, neutral: 0, negative: 0, fresh: 0 } }))
      .then((d: { mentions: Mention[]; counts: Counts }) => {
        setMentions(d.mentions);
        setCounts(d.counts);
      })
      .catch(() => setMentions([]));
  }, [queryId, sentiment, status, q]);

  useEffect(() => {
    loadStreams();
  }, [loadStreams]);
  useEffect(() => {
    const t = setTimeout(loadMentions, 200);
    return () => clearTimeout(t);
  }, [loadMentions]);

  async function createStream(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError(null);
    try {
      const terms = termsCsv.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch('/api/listening/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, terms, platforms: [...platforms] }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(d?.error ?? 'Create failed.');
        return;
      }
      setName('');
      setTermsCsv('');
      setPlatforms(new Set());
      loadStreams();
    } finally {
      setBusy(null);
    }
  }

  async function removeStream(id: string) {
    if (!window.confirm('Delete this stream? Its mentions are kept but unlinked.')) return;
    setBusy(id);
    try {
      await fetch(`/api/listening/queries/${id}`, { method: 'DELETE' });
      if (queryId === id) setQueryId('');
      loadStreams();
    } finally {
      setBusy(null);
    }
  }

  async function setMentionStatus(id: string, next: string) {
    setBusy(id);
    try {
      await fetch(`/api/listening/mentions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      loadMentions();
      loadStreams();
    } finally {
      setBusy(null);
    }
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) => {
      const n = new Set(prev);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Streams */}
      <div className="lg:col-span-1 space-y-5">
        <Card title="New stream" description="Terms to track (comma-separated). Leave networks empty to watch all.">
          <form onSubmit={createStream} className="space-y-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand mentions" required />
            <Input label="Terms" value={termsCsv} onChange={(e) => setTermsCsv(e.target.value)} placeholder="rehabsync, #physio, @rehabsync" />
            <div>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Networks (empty = all)</p>
              <div className="flex flex-wrap gap-1.5">
                {ENGAGE_PLATFORMS.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className="rounded-full px-2.5 py-1 text-xs font-medium border"
                    style={
                      platforms.has(p)
                        ? { backgroundColor: 'var(--brand-primary)', color: '#fff', borderColor: 'var(--brand-primary)' }
                        : { borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }
                    }
                  >
                    {engagePlatformLabel(p)}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
            <Button type="submit" loading={busy === 'create'} disabled={!name.trim()}>Create stream</Button>
          </form>
        </Card>

        <Card title="Streams">
          {streams === null ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
          ) : streams.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No streams yet.</p>
          ) : (
            <ul className="space-y-1">
              <li>
                <button onClick={() => setQueryId('')} className="w-full text-left px-2 py-1.5 rounded text-sm" style={{ backgroundColor: queryId === '' ? 'var(--bg-secondary)' : 'transparent', color: 'var(--text-primary)' }}>
                  All streams
                </button>
              </li>
              {streams.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <button onClick={() => setQueryId(s.id)} className="flex-1 text-left px-2 py-1.5 rounded min-w-0" style={{ backgroundColor: queryId === s.id ? 'var(--bg-secondary)' : 'transparent' }}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.mentions}{s.fresh ? ` · ${s.fresh} new` : ''}</span>
                    </span>
                    <span className="block text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{s.terms.join(', ')}</span>
                  </button>
                  <button onClick={() => void removeStream(s.id)} disabled={busy === s.id} aria-label="Delete stream" style={{ color: 'var(--color-error-text)' }}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Mentions feed */}
      <div className="lg:col-span-2">
        <Card>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {SENTIMENT_TABS.map((s) => (
              <button
                key={s || 'all'}
                onClick={() => setSentiment(s)}
                className="rounded-full px-3 py-1 text-xs font-medium border capitalize"
                style={
                  sentiment === s
                    ? { backgroundColor: 'var(--brand-primary)', color: '#fff', borderColor: 'var(--brand-primary)' }
                    : { borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }
                }
              >
                {s || 'all'}
              </button>
            ))}
            <span className="mx-1 h-4 w-px" style={{ backgroundColor: 'var(--border-primary)' }} />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border px-2 py-1 text-xs" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="archived">Archived</option>
              <option value="">Any status</option>
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="rounded-lg border px-2 py-1 text-xs flex-1 min-w-32" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--color-success-text)' }}>{counts.positive}+</span> · {counts.neutral} · <span style={{ color: 'var(--color-error-text)' }}>{counts.negative}−</span>
            </span>
          </div>

          {mentions === null ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
          ) : mentions.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>No mentions match — they appear here as your streams pick them up.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
              {mentions.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.authorName ?? 'Unknown'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{engagePlatformLabel(m.platform)}</span>
                    <Badge variant={sentimentVariant(m.sentiment)}>{m.sentiment}</Badge>
                    {m.matchedTerm && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>“{m.matchedTerm}”</span>}
                    <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>{fmt(m.createdAt)}</span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{m.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {m.permalink && (
                      <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-0.5" style={{ color: 'var(--brand-primary)' }}>
                        source <ExternalLink size={10} />
                      </a>
                    )}
                    {m.status !== 'reviewed' && (
                      <Button size="sm" variant="secondary" disabled={busy === m.id} onClick={() => void setMentionStatus(m.id, 'reviewed')}>Reviewed</Button>
                    )}
                    {m.status !== 'archived' && (
                      <Button size="sm" variant="ghost" disabled={busy === m.id} onClick={() => void setMentionStatus(m.id, 'archived')}>Archive</Button>
                    )}
                    {m.status !== 'new' && <Badge variant="neutral">{m.status}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
