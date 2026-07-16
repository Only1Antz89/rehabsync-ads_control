'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

interface Comment {
  id: string;
  authorName: string | null;
  authorEmail: string;
  body: string;
  createdAt: string;
}

export function PostComments({ postId }: { postId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`/api/posts/${postId}/comments`)
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((d: { comments: Comment[] }) => setComments(d.comments))
      .catch(() => setComments([]));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        setText('');
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/posts/${postId}/comments/${id}`, { method: 'DELETE' }).catch(() => undefined);
    load();
  }

  const inputStyle = { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' } as const;

  return (
    <div className="mt-3 rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border-secondary)' }}>
      {comments === null ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No comments yet — start the discussion.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.authorName ?? c.authorEmail}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {new Date(c.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button type="button" onClick={() => void remove(c.id)} className="text-[11px] cursor-pointer" style={{ color: 'var(--color-error-text)' }}>
                    Delete
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment for the team…"
          className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
          style={inputStyle}
        />
        <Button type="submit" size="sm" loading={busy}>Post</Button>
      </form>
    </div>
  );
}
