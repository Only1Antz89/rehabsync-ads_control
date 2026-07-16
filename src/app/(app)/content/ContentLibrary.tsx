'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';

interface Snippet {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
}

export function ContentLibrary() {
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () =>
    fetch('/api/content')
      .then((r) => (r.ok ? r.json() : { snippets: [] }))
      .then((d: { snippets: Snippet[] }) => setSnippets(d.snippets))
      .catch(() => setSnippets([]));

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(d?.error ?? 'Could not save the snippet.');
        return;
      }
      setTitle('');
      setBody('');
      setTags('');
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/content/${id}`, { method: 'DELETE' }).catch(() => undefined);
    load();
  }

  async function copy(snippet: Snippet) {
    try {
      await navigator.clipboard.writeText(snippet.body);
      setCopied(snippet.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card title="New snippet" description="Reusable captions, hooks or CTAs — insert them in the composer.">
        <form onSubmit={add} className="space-y-2">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              required
            />
          </div>
          <Input label="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
          {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
          <Button type="submit" loading={busy}>Save snippet</Button>
        </form>
      </Card>

      <Card title="Library">
        {snippets === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : snippets.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No snippets yet.</p>
        ) : (
          <ul className="space-y-3">
            {snippets.map((s) => (
              <li key={s.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => void copy(s)} className="text-xs cursor-pointer" style={{ color: 'var(--brand-primary)' }}>
                      {copied === s.id ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" onClick={() => void remove(s.id)} className="text-xs cursor-pointer" style={{ color: 'var(--color-error-text)' }}>
                      Delete
                    </button>
                  </div>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{s.body}</p>
                {s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {s.tags.map((t) => (
                      <Badge key={t} variant="neutral">{t}</Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
