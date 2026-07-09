'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '@/components/ui';

interface TargetRow {
  id: string;
  platform: string;
  status: string;
  accountName: string | null;
}

interface PostRow {
  id: string;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  title: string | null;
  status: string;
  approvalStatus: string;
  scheduledAt: string | null;
  createdBy: string | null;
  targets: TargetRow[];
}

export function ApprovalsManager() {
  const [pending, setPending] = useState<PostRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/posts')
      .then((res) => (res.ok ? res.json() : { posts: [] }))
      .then((d: { posts: PostRow[] }) => setPending(d.posts.filter((p) => p.approvalStatus === 'pending')))
      .catch(() => setPending([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, action: 'approve' | 'reject') {
    let note: string | undefined;
    if (action === 'reject') {
      note = window.prompt('Why is this rejected? (shown to the author)') ?? undefined;
      if (note === undefined) return; // cancelled
    }
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${id}/approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note !== undefined ? { action, note } : { action }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Action failed.');
      }
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      {pending === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : pending.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nothing waiting for approval. Posts land here when the approval workflow is on
            (Settings) and someone with the user role composes one.
          </p>
        </Card>
      ) : (
        pending.map((post) => (
          <Card key={post.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                  {post.title ? `${post.title} — ` : ''}
                  {post.body || '(no text)'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  by {post.createdBy ?? 'unknown'}
                  {post.scheduledAt
                    ? ` · scheduled ${new Date(post.scheduledAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                    : ' · draft'}
                  {post.linkUrl ? ` · link: ${post.linkUrl}` : ''}
                  {post.imageUrl ? ' · has image' : ''}
                  {post.videoUrl ? ' · has video' : ''}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {post.targets.map((target) => (
                    <Badge key={target.id} variant="neutral">
                      {target.accountName ?? target.platform}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" disabled={busy === post.id} onClick={() => void decide(post.id, 'approve')}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === post.id}
                  onClick={() => void decide(post.id, 'reject')}
                >
                  Reject
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
