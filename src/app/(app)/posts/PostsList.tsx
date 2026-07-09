'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, ExternalLink, Send, Trash2 } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { PLATFORM_RULES } from '@/lib/social/validate';
import type { SocialPlatform } from '@/db/schema';

interface Target {
  id: string;
  postId: string;
  accountId: string | null;
  platform: SocialPlatform;
  status: string;
  platformUrl: string | null;
  error: string | null;
  accountName: string | null;
}

interface Post {
  id: string;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdBy: string | null;
  targets: Target[];
}

function postVariant(status: string): BadgeVariant {
  if (status === 'published') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'partial') return 'warning';
  if (status === 'scheduled' || status === 'publishing') return 'info';
  return 'neutral';
}

function targetVariant(status: string): BadgeVariant {
  if (status === 'published' || status === 'manual_done') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'manual') return 'warning';
  return 'neutral';
}

export function PostsList() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/posts')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { posts: Post[] }) => setPosts(d.posts))
      .catch(() => setError('Could not load posts.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function publishNow(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish_now' }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Publish failed.');
      }
      load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/posts/${id}`, { method: 'DELETE' });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function markManual(target: Target, status: 'manual_done' | 'manual') {
    setBusy(target.id);
    try {
      await fetch(`/api/posts/${target.postId}/targets/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function copyBody(post: Post) {
    const text = [post.body, post.linkUrl ?? ''].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(post.id);
    setTimeout(() => setCopied(null), 1500);
  }

  if (error && !posts) return <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>;
  if (!posts) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>;
  if (posts.length === 0) {
    return (
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          No posts yet — head to the Composer to create your first.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
      {posts.map((post) => (
        <Card key={post.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant={postVariant(post.status)}>{post.status}</Badge>
                {post.scheduledAt && post.status === 'scheduled' && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    due {new Date(post.scheduledAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                {post.body.length > 240 ? `${post.body.slice(0, 240)}…` : post.body}
              </p>
              {post.linkUrl && (
                <p className="text-xs mt-1 truncate" style={{ color: 'var(--brand-primary)' }}>{post.linkUrl}</p>
              )}
            </div>
            {post.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover border shrink-0" style={{ borderColor: 'var(--border-primary)' }} />
            )}
          </div>

          <div className="mt-3 space-y-2">
            {post.targets.map((target) => (
              <div key={target.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-secondary)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={targetVariant(target.status)}>{target.status.replace('_', ' ')}</Badge>
                  <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {target.accountName ?? PLATFORM_RULES[target.platform].label}
                  </span>
                  {target.error && (
                    <span className="text-xs truncate" style={{ color: 'var(--color-error-text)' }}>{target.error}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {target.platformUrl && (
                    <a href={target.platformUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--brand-primary)' }}>
                      View <ExternalLink size={11} />
                    </a>
                  )}
                  {target.status === 'manual' && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => void copyBody(post)}>
                        <Copy size={12} className="mr-1" /> {copied === post.id ? 'Copied!' : 'Copy caption'}
                      </Button>
                      <Button size="sm" disabled={busy === target.id} onClick={() => void markManual(target, 'manual_done')}>
                        Mark posted
                      </Button>
                    </>
                  )}
                  {target.status === 'manual_done' && (
                    <Button size="sm" variant="ghost" disabled={busy === target.id} onClick={() => void markManual(target, 'manual')}>
                      Undo
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed' || post.status === 'partial') && (
              <Button size="sm" disabled={busy === post.id} onClick={() => void publishNow(post.id)}>
                <Send size={12} className="mr-1" /> Publish now
              </Button>
            )}
            {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed') && (
              <Button size="sm" variant="danger" disabled={busy === post.id} onClick={() => void remove(post.id)}>
                <Trash2 size={12} className="mr-1" /> Delete
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
