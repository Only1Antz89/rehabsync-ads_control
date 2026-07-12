'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Input } from '@/components/ui';
import { PLATFORM_RULES, validateForPlatform } from '@/lib/social/validate';
import type { SocialPlatform } from '@/db/schema';

/** Sign with our API, then PUT the file straight to Supabase Storage; returns the public URL. */
async function uploadMedia(file: File): Promise<string> {
  const signRes = await fetch('/api/media/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  });
  const signed = (await signRes.json().catch(() => null)) as
    | { uploadUrl?: string; publicUrl?: string; error?: string }
    | null;
  if (!signRes.ok || !signed?.uploadUrl || !signed.publicUrl) {
    throw new Error(signed?.error ?? 'Could not prepare the upload.');
  }
  const put = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status}).`);
  return signed.publicUrl;
}

interface Account {
  id: string;
  platform: SocialPlatform;
  displayName: string;
  status: string;
}

interface MediaAsset {
  id: string;
  url: string;
  kind: string;
  filename: string | null;
}

const MANUAL_CHOICES: SocialPlatform[] = ['linkedin', 'x', 'tiktok', 'youtube'];

export function Composer() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [manualImage, setManualImage] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [library, setLibrary] = useState<MediaAsset[]>([]);
  const [libPicker, setLibPicker] = useState<null | 'image' | 'video'>(null);
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Set<SocialPlatform>>(new Set());
  const [scheduledAt, setScheduledAt] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [nextSlot, setNextSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'image' | 'video' | null>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const loadLibrary = () =>
    fetch('/api/media')
      .then((r) => (r.ok ? r.json() : { media: [] }))
      .then((d: { media: MediaAsset[] }) => setLibrary(d.media))
      .catch(() => undefined);

  async function recordMedia(url: string, kind: 'image' | 'video', filename: string, sizeBytes: number) {
    await fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, kind, filename, sizeBytes }),
    }).catch(() => undefined);
    loadLibrary();
  }

  function addImage(url: string) {
    const u = url.trim();
    if (u) setImages((prev) => (prev.includes(u) ? prev : [...prev, u]));
  }

  async function onPickFile(kind: 'image' | 'video', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setUploading(kind);
    setError(null);
    try {
      const url = await uploadMedia(file);
      await recordMedia(url, kind, file.name, file.size);
      if (kind === 'image') addImage(url);
      else setVideoUrl(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(null);
    }
  }

  useEffect(() => {
    fetch('/api/accounts')
      .then((res) => (res.ok ? res.json() : { accounts: [] }))
      .then((d: { accounts: Account[] }) => setAccounts(d.accounts.filter((a) => a.status === 'connected')))
      .catch(() => setAccounts([]));
    fetch('/api/queue/slots')
      .then((res) => (res.ok ? res.json() : { next: null }))
      .then((d: { next: string | null }) => setNextSlot(d.next))
      .catch(() => undefined);
    loadLibrary();
  }, []);

  const setOverride = (key: string, value: string) => setOverrides((prev) => ({ ...prev, [key]: value }));

  const draft = useMemo(
    () => ({
      body,
      linkUrl: linkUrl || null,
      imageUrl: images[0] ?? null,
      videoUrl: videoUrl || null,
      title: title || null,
    }),
    [body, linkUrl, images, videoUrl, title],
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

  async function submit(mode: 'draft' | 'schedule' | 'now' | 'queue') {
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
          imageUrl: images[0] ?? null,
          imageUrls: images,
          videoUrl: videoUrl || null,
          title: title || null,
          accountIds: [...selected],
          manualPlatforms: [...manual],
          scheduledAt: mode === 'schedule' ? scheduledAt || null : null,
          publishNow: mode === 'now',
          addToQueue: mode === 'queue',
          overrides,
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
          {/* Images (carousel-ready — the first is primary; API publishing uses the primary today) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Images {images.length > 1 ? `— carousel of ${images.length}` : '(required for Instagram)'}
              </label>
              <div className="flex gap-1.5">
                <input ref={imageFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => void onPickFile('image', e)} />
                <Button type="button" size="sm" variant="secondary" loading={uploading === 'image'} onClick={() => imageFileRef.current?.click()}>Upload</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setLibPicker(libPicker === 'image' ? null : 'image')}>Library</Button>
              </div>
            </div>
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {images.map((url, i) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-20 w-20 object-cover rounded-lg border" style={{ borderColor: 'var(--border-primary)' }} />
                    {i === 0 && (
                      <span className="absolute bottom-0 left-0 text-[9px] px-1 rounded-tr" style={{ backgroundColor: 'var(--brand-primary)', color: '#fff' }}>primary</span>
                    )}
                    <button type="button" onClick={() => setImages((prev) => prev.filter((u) => u !== url))} className="absolute -top-1.5 -right-1.5 rounded-full h-5 w-5 flex items-center justify-center text-xs leading-none" style={{ backgroundColor: 'var(--color-error)', color: '#fff' }} aria-label="Remove image">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={manualImage} onChange={(e) => setManualImage(e.target.value)} placeholder="…or paste an image URL" className="flex-1 rounded-lg border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />
              <Button type="button" size="sm" variant="secondary" onClick={() => { addImage(manualImage); setManualImage(''); }}>Add</Button>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Video URL (required for TikTok / YouTube)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://…/video.mp4"
                hint="Public https video — TikTok pulls it from this URL; YouTube uploads it."
              />
            </div>
            <input ref={videoFileRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => void onPickFile('video', e)} />
            <Button type="button" variant="secondary" loading={uploading === 'video'} onClick={() => videoFileRef.current?.click()}>Upload</Button>
            <Button type="button" variant="ghost" onClick={() => setLibPicker(libPicker === 'video' ? null : 'video')}>Library</Button>
          </div>

          {libPicker && (
            <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Media library — {libPicker}s</span>
                <button type="button" onClick={() => setLibPicker(null)} className="text-xs" style={{ color: 'var(--text-muted)' }}>close</button>
              </div>
              {library.filter((m) => m.kind === libPicker).length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nothing saved yet — uploads are added to the library automatically.</p>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {library
                    .filter((m) => m.kind === libPicker)
                    .map((m) =>
                      libPicker === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={m.id} src={m.url} alt={m.filename ?? ''} onClick={() => addImage(m.url)} className="h-16 w-16 object-cover rounded border cursor-pointer" style={{ borderColor: 'var(--border-primary)' }} />
                      ) : (
                        <button key={m.id} type="button" onClick={() => { setVideoUrl(m.url); setLibPicker(null); }} className="text-xs px-2 py-1 rounded border max-w-40 truncate" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
                          {m.filename ?? m.url}
                        </button>
                      ),
                    )}
                </div>
              )}
            </div>
          )}
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

        {targetsPicked && (
          <Card title="Per-network captions" description="Optional — leave blank to use the caption above. Tailor tone or hashtags per network.">
            <div className="space-y-3">
              {accounts.filter((a) => selected.has(a.id)).map((a) => (
                <div key={a.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.displayName}</span>
                    <Badge variant="info">{PLATFORM_RULES[a.platform].label}</Badge>
                  </div>
                  <textarea
                    value={overrides[a.id] ?? ''}
                    onChange={(e) => setOverride(a.id, e.target.value)}
                    rows={2}
                    placeholder={body || 'Uses the base caption'}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
              ))}
              {[...manual].map((platform) => (
                <div key={platform}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{PLATFORM_RULES[platform].label}</span>
                    <Badge variant="neutral">manual</Badge>
                  </div>
                  <textarea
                    value={overrides[platform] ?? ''}
                    onChange={(e) => setOverride(platform, e.target.value)}
                    rows={2}
                    placeholder={body || 'Uses the base caption'}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

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
              {nextSlot && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Or add to the queue → next free slot{' '}
                  {new Date(nextSlot).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void submit('now')} disabled={!targetsPicked || blocking.length > 0} loading={busy === 'now'}>
                Publish now
              </Button>
              <Button variant="secondary" onClick={() => void submit('schedule')} disabled={!targetsPicked || !scheduledAt || blocking.length > 0} loading={busy === 'schedule'}>
                Schedule
              </Button>
              <Button variant="secondary" onClick={() => void submit('queue')} disabled={!targetsPicked || !nextSlot || blocking.length > 0} loading={busy === 'queue'}>
                Add to queue
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
