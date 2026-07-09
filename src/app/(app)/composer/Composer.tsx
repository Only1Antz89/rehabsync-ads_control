'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Input } from '@/components/ui';
import { PLATFORM_RULES, validateForPlatform } from '@/lib/social/validate';
import type { SocialPlatform } from '@/db/schema';

interface Account {
  id: string;
  platform: SocialPlatform;
  displayName: string;
  status: string;
}

const MANUAL_CHOICES: SocialPlatform[] = ['linkedin', 'x', 'tiktok', 'youtube'];

export function Composer() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Set<SocialPlatform>>(new Set());
  const [scheduledAt, setScheduledAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/accounts')
      .then((res) => (res.ok ? res.json() : { accounts: [] }))
      .then((d: { accounts: Account[] }) => setAccounts(d.accounts.filter((a) => a.status === 'connected')))
      .catch(() => setAccounts([]));
  }, []);

  const draft = useMemo(
    () => ({
      body,
      linkUrl: linkUrl || null,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      title: title || null,
    }),
    [body, linkUrl, imageUrl, videoUrl, title],
  );

  const problems = useMemo(() => {
    const platforms = new Set<SocialPlatform>([
      ...accounts.filter((a) => selected.has(a.id)).map((a) => a.platform),
      ...manual,
    ]);
    return [...platforms].flatMap((p) => validateForPlatform(draft, p));
  }, [accounts, selected, manual, draft]);

  function toggle<T>(set: Set<T>, value: T, update: (next: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(next);
  }

  async function submit(mode: 'draft' | 'schedule' | 'now') {
    setBusy(mode);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          linkUrl: linkUrl || null,
          imageUrl: imageUrl || null,
          videoUrl: videoUrl || null,
          title: title || null,
          accountIds: [...selected],
          manualPlatforms: [...manual],
          scheduledAt: mode === 'schedule' ? scheduledAt || null : null,
          publishNow: mode === 'now',
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; notice?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? 'Save failed.');
        return;
      }
      if (data?.notice) {
        // Approval workflow queued it — stay here so the author sees why nothing published.
        setNotice(data.notice);
        return;
      }
      router.push('/posts');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const targetsPicked = selected.size + manual.size > 0;
  const blocking = problems.filter((p) => !p.includes('not clickable'));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card title="Content">
        <div className="space-y-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="What do you want to share?"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          />
          <p className="text-xs text-right" style={{ color: 'var(--text-muted)' }}>{body.length} characters</p>
          <Input label="Link (optional)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://rehabsync.app/…" />
          <Input
            label="Image URL (optional — required for Instagram)"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…/image.jpg"
            hint="Public https image."
          />
          {imageUrl.trim() && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Preview" className="max-h-48 rounded-lg border" style={{ borderColor: 'var(--border-primary)' }} />
          )}
          <Input
            label="Video URL (required for TikTok / YouTube)"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://…/video.mp4"
            hint="Public https video — TikTok pulls it from this URL; YouTube uploads it."
          />
          <Input
            label="Title (required for YouTube)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Clinic tour: the new studio"
          />
        </div>
      </Card>

      <div className="space-y-5">
        <Card title="Targets" description="Connected accounts publish via API. Everything else becomes a manual-export checklist item.">
          {accounts.length > 0 ? (
            <div className="space-y-2 mb-4">
              {accounts.map((account) => (
                <label key={account.id} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={selected.has(account.id)} onChange={() => toggle(selected, account.id, setSelected)} />
                  {account.displayName}
                  <Badge variant="info">{PLATFORM_RULES[account.platform].label}</Badge>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              No connected accounts yet — an admin can connect Meta under Connections.
            </p>
          )}
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Manual export
          </p>
          <div className="space-y-2">
            {MANUAL_CHOICES.map((platform) => (
              <label key={platform} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={manual.has(platform)} onChange={() => toggle(manual, platform, setManual)} />
                {PLATFORM_RULES[platform].label}
                <Badge variant="neutral">copy &amp; post</Badge>
              </label>
            ))}
          </div>
        </Card>

        <Card title="Publish">
          {problems.length > 0 && (
            <ul className="mb-3 space-y-1">
              {problems.map((p, i) => (
                <li key={i} className="text-xs" style={{ color: p.includes('not clickable') ? 'var(--color-warning-text)' : 'var(--color-error-text)' }}>
                  {p}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mb-3 text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
          {notice && <p className="mb-3 text-sm" style={{ color: 'var(--color-success-text)' }}>{notice}</p>}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Schedule for (Europe/London)
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void submit('now')} disabled={!targetsPicked || blocking.length > 0} loading={busy === 'now'}>
                Publish now
              </Button>
              <Button variant="secondary" onClick={() => void submit('schedule')} disabled={!targetsPicked || !scheduledAt || blocking.length > 0} loading={busy === 'schedule'}>
                Schedule
              </Button>
              <Button variant="ghost" onClick={() => void submit('draft')} disabled={!targetsPicked} loading={busy === 'draft'}>
                Save draft
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
