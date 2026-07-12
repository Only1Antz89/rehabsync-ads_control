'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Send, Circle } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface Thread {
  id: string;
  platform: string;
  externalId: string;
  kind: string;
  authorName: string | null;
  authorHandle: string | null;
  permalink: string | null;
  snippet: string | null;
  status: string;
  assignedTo: string | null;
  unread: boolean;
  lastMessageAt: string;
}

interface Message {
  id: string;
  direction: string;
  authorName: string | null;
  body: string;
  status: string;
  sentBy: string | null;
  errorText: string | null;
  createdAt: string;
}

interface Counts {
  open: number;
  unread: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

const STATUS_TABS = ['open', 'pending', 'closed', 'spam'] as const;

function statusVariant(status: string): BadgeVariant {
  if (status === 'open') return 'info';
  if (status === 'pending') return 'warning';
  if (status === 'spam') return 'error';
  return 'neutral';
}

function deliveryVariant(status: string): BadgeVariant {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'queued') return 'warning';
  return 'neutral';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function InboxClient({ me }: { me: string }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [counts, setCounts] = useState<Counts>({ open: 0, unread: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ thread: Thread; messages: Message[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  // Filters
  const [status, setStatus] = useState<string>('open');
  const [platform, setPlatform] = useState('');
  const [assigned, setAssigned] = useState('');
  const [q, setQ] = useState('');

  const loadThreads = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (platform) params.set('platform', platform);
    if (assigned) params.set('assigned', assigned);
    if (q.trim()) params.set('q', q.trim());
    fetch(`/api/inbox/threads?${params}`)
      .then((r) => (r.ok ? r.json() : { threads: [], counts: { open: 0, unread: 0 } }))
      .then((d: { threads: Thread[]; counts: Counts }) => {
        setThreads(d.threads);
        setCounts(d.counts);
      })
      .catch(() => setThreads([]));
  }, [status, platform, assigned, q]);

  useEffect(() => {
    const t = setTimeout(loadThreads, 200);
    return () => clearTimeout(t);
  }, [loadThreads]);

  const openThread = useCallback((id: string) => {
    setSelectedId(id);
    setDetail(null);
    fetch(`/api/inbox/threads/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { thread: Thread; messages: Message[] } | null) => {
        setDetail(d);
        // reflect the now-read state in the list without a full refetch
        setThreads((prev) => prev?.map((t) => (t.id === id ? { ...t, unread: false } : t)) ?? prev);
      })
      .catch(() => setDetail(null));
  }, []);

  async function triage(patch: Record<string, unknown>) {
    if (!selectedId) return;
    setBusy('triage');
    try {
      const res = await fetch(`/api/inbox/threads/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const d = (await res.json()) as { thread: Thread };
        setDetail((prev) => (prev ? { ...prev, thread: { ...prev.thread, ...d.thread } } : prev));
        loadThreads();
      }
    } finally {
      setBusy(null);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setBusy('reply');
    try {
      const res = await fetch(`/api/inbox/threads/${selectedId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply }),
      });
      if (res.ok) {
        setReply('');
        openThread(selectedId);
        loadThreads();
      }
    } finally {
      setBusy(null);
    }
  }

  const thread = detail?.thread;

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className="rounded-full px-3 py-1 text-xs font-medium border capitalize"
            style={
              status === s
                ? { backgroundColor: 'var(--brand-primary)', color: '#fff', borderColor: 'var(--brand-primary)' }
                : { borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }
            }
          >
            {s}
          </button>
        ))}
        <span className="mx-1 h-4 w-px" style={{ backgroundColor: 'var(--border-primary)' }} />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border px-2 py-1 text-xs"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          <option value="">All networks</option>
          {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={assigned}
          onChange={(e) => setAssigned(e.target.value)}
          className="rounded-lg border px-2 py-1 text-xs"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="rounded-lg border px-2 py-1 text-xs flex-1 min-w-32"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {counts.open} open · {counts.unread} unread
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Thread list */}
        <div className="lg:col-span-1">
          <Card className="overflow-hidden">
            <div className="max-h-[68vh] overflow-y-auto -mx-6 -my-4">
              {threads === null ? (
                <p className="text-sm p-4" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
              ) : threads.length === 0 ? (
                <p className="text-sm p-4" style={{ color: 'var(--text-secondary)' }}>Nothing here — new engagement lands as it arrives.</p>
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                  {threads.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => openThread(t.id)}
                        className="w-full text-left px-4 py-3 flex gap-2"
                        style={{ backgroundColor: selectedId === t.id ? 'var(--bg-secondary)' : 'transparent' }}
                      >
                        <span className="mt-1 shrink-0" style={{ color: t.unread ? 'var(--brand-primary)' : 'transparent' }}>
                          <Circle size={8} fill="currentColor" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm truncate" style={{ color: 'var(--text-primary)', fontWeight: t.unread ? 600 : 400 }}>
                              {t.authorName ?? 'Unknown'}
                            </span>
                            <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{fmt(t.lastMessageAt)}</span>
                          </span>
                          <span className="block text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t.snippet}</span>
                          <span className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                              {PLATFORM_LABELS[t.platform] ?? t.platform}
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.kind}</span>
                            {t.assignedTo && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· {t.assignedTo === me ? 'you' : t.assignedTo}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* Detail */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            {!thread ? (
              <p className="text-sm py-16 text-center" style={{ color: 'var(--text-secondary)' }}>Select a conversation.</p>
            ) : (
              <div className="flex flex-col" style={{ minHeight: '68vh' }}>
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{thread.authorName ?? 'Unknown'}</span>
                      <Badge variant={statusVariant(thread.status)}>{thread.status}</Badge>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {PLATFORM_LABELS[thread.platform] ?? thread.platform} · {thread.kind}
                      {thread.authorHandle ? ` · ${thread.authorHandle}` : ''}
                      {thread.permalink && (
                        <>
                          {' · '}
                          <a href={thread.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5" style={{ color: 'var(--brand-primary)' }}>
                            source <ExternalLink size={10} />
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['open', 'pending', 'closed', 'spam'] as const).map((s) => (
                      <Button key={s} size="sm" variant={thread.status === s ? 'primary' : 'secondary'} disabled={busy === 'triage'} onClick={() => void triage({ status: s })}>
                        {s}
                      </Button>
                    ))}
                    <Button size="sm" variant="secondary" disabled={busy === 'triage'} onClick={() => void triage({ assignedTo: thread.assignedTo === me ? null : me })}>
                      {thread.assignedTo === me ? 'Unassign' : 'Assign to me'}
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto py-4 space-y-3">
                  {detail?.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[80%] rounded-lg px-3 py-2" style={{ backgroundColor: m.direction === 'out' ? 'var(--brand-primary)' : 'var(--bg-tertiary)' }}>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: m.direction === 'out' ? '#fff' : 'var(--text-primary)' }}>{m.body}</p>
                        <p className="text-[10px] mt-1 flex items-center gap-1.5" style={{ color: m.direction === 'out' ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)' }}>
                          {m.direction === 'out' ? (m.sentBy ?? 'You') : (m.authorName ?? 'Them')} · {fmt(m.createdAt)}
                          {m.direction === 'out' && <Badge variant={deliveryVariant(m.status)}>{m.status}</Badge>}
                        </p>
                        {m.errorText && <p className="text-[10px] mt-0.5" style={{ color: '#fff' }}>{m.errorText}</p>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply */}
                <form onSubmit={sendReply} className="pt-3 border-t" style={{ borderColor: 'var(--border-secondary)' }}>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    placeholder="Write a reply…"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Replies to networks without a connected write scope are queued until it&apos;s wired.
                    </span>
                    <Button type="submit" size="sm" loading={busy === 'reply'} disabled={!reply.trim()}>
                      <Send size={14} className="mr-1" /> Send
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
