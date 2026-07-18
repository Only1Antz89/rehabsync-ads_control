'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Eye, ImageOff } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import { PLATFORM_RULES, validateForPlatform } from '@/lib/social/validate';
import type { SocialPlatform } from '@/db/schema';
import { PreviewPanel } from './PreviewPanel';
import type { PreviewTarget } from './PreviewPanel';
import { FormatPreviewModal } from './FormatPreviewModal';

interface CanvaDesign {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  stage: string;
  stages: string[];
}

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

export function Composer({ editId = null, initialImage = null }: { editId?: string | null; initialImage?: string | null }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Edit mode: targets are fixed on an existing post; we load content + overrides into the form.
  const [editTargets, setEditTargets] = useState<PreviewTarget[]>([]);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [manualImage, setManualImage] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [library, setLibrary] = useState<MediaAsset[]>([]);
  const [libPicker, setLibPicker] = useState<null | 'image' | 'video'>(null);
  // Canva design picker (pull a synced design straight into this post)
  const [canvaOpen, setCanvaOpen] = useState(false);
  const [canvaDesigns, setCanvaDesigns] = useState<CanvaDesign[] | null>(null);
  const [canvaError, setCanvaError] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  // Per-format preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
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
  // AI caption assist
  const [aiTopic, setAiTopic] = useState('');
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [snippets, setSnippets] = useState<{ id: string; title: string; body: string }[]>([]);
  const [brandHashtags, setBrandHashtags] = useState<string[]>([]);
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

  function toggleCanvaPicker() {
    const next = !canvaOpen;
    setCanvaOpen(next);
    setLibPicker(null);
    if (next && canvaDesigns === null) void loadCanvaDesigns();
  }

  async function loadCanvaDesigns() {
    setCanvaError(null);
    try {
      const res = await fetch('/api/integrations/canva/content');
      if (!res.ok) {
        setCanvaError(res.status === 401 ? 'Sign in again to browse Canva designs.' : 'Could not load Canva designs.');
        setCanvaDesigns([]);
        return;
      }
      const d = (await res.json()) as { items: CanvaDesign[] };
      setCanvaDesigns(d.items);
    } catch {
      setCanvaError('Could not load Canva designs.');
      setCanvaDesigns([]);
    }
  }

  /** Render a synced Canva design to an image and add it to this post. */
  async function prepareCanvaDesign(design: CanvaDesign) {
    setPreparingId(design.id);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/canva/content/${design.id}/prepare`, { method: 'POST' });
      const d = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !d?.url) {
        setError(d?.error ?? 'Could not prepare this design — check the Canva connection and try again.');
        return;
      }
      addImage(d.url);
      setCanvaOpen(false);
    } finally {
      setPreparingId(null);
    }
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
    fetch('/api/content')
      .then((res) => (res.ok ? res.json() : { snippets: [] }))
      .then((d: { snippets: { id: string; title: string; body: string }[] }) => setSnippets(d.snippets))
      .catch(() => undefined);
    fetch('/api/admin/brand')
      .then((res) => (res.ok ? res.json() : { brand: null }))
      .then((d: { brand: { hashtags?: string[] } | null }) => setBrandHashtags(d.brand?.hashtags ?? []))
      .catch(() => undefined);
    loadLibrary();
  }, []);

  // Prefill an image handed off from the Canva library ("Prepare for composer"). Create mode only.
  useEffect(() => {
    if (editId || !initialImage) return;
    const u = initialImage.trim();
    if (u) setImages((prev) => (prev.includes(u) ? prev : [...prev, u]));
  }, [editId, initialImage]);

  const setOverride = (key: string, value: string) => setOverrides((prev) => ({ ...prev, [key]: value }));

  // Edit mode loader — populate the form from the existing post + its targets.
  useEffect(() => {
    if (!editId) return;
    fetch(`/api/posts/${editId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then(
        (d: {
          post: {
            body: string;
            linkUrl: string | null;
            imageUrl: string | null;
            imageUrls: string[] | null;
            videoUrl: string | null;
            title: string | null;
            status: string;
            scheduledAt: string | null;
          };
          targets: { accountId: string | null; platform: SocialPlatform; accountName: string | null; bodyOverride: string | null }[];
        }) => {
          setBody(d.post.body);
          setLinkUrl(d.post.linkUrl ?? '');
          setVideoUrl(d.post.videoUrl ?? '');
          setTitle(d.post.title ?? '');
          const imgs = d.post.imageUrls?.length ? d.post.imageUrls : d.post.imageUrl ? [d.post.imageUrl] : [];
          setImages(imgs);
          setEditStatus(d.post.status);
          if (d.post.scheduledAt) setScheduledAt(d.post.scheduledAt.slice(0, 16));
          const nextOverrides: Record<string, string> = {};
          const targets: PreviewTarget[] = d.targets.map((t) => {
            const key = t.accountId ?? t.platform;
            if (t.bodyOverride) nextOverrides[key] = t.bodyOverride;
            return { key, name: t.accountName ?? PLATFORM_RULES[t.platform].label, platform: t.platform };
          });
          setOverrides(nextOverrides);
          setEditTargets(targets);
        },
      )
      .catch(() => setError('Could not load this post for editing.'));
  }, [editId]);

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

  // Unified target list driving validation, per-network captions and the preview cards.
  const previewTargets = useMemo<PreviewTarget[]>(() => {
    if (editId) return editTargets;
    return [
      ...accounts
        .filter((a) => selected.has(a.id))
        .map((a) => ({ key: a.id, name: a.displayName, platform: a.platform })),
      ...[...manual].map((p) => ({ key: p, name: PLATFORM_RULES[p].label, platform: p })),
    ];
  }, [editId, editTargets, accounts, selected, manual]);

  const problems = useMemo(() => {
    const platforms = new Set<SocialPlatform>(previewTargets.map((t) => t.platform));
    return [...platforms].flatMap((p) => validateForPlatform(draft, p));
  }, [previewTargets, draft]);

  // Per-network caption for the format preview: use a target's override for that platform if set.
  const captionByPlatform = useMemo(() => {
    const map: Partial<Record<SocialPlatform, string>> = {};
    for (const t of previewTargets) {
      const override = overrides[t.key]?.trim();
      if (override && !map[t.platform]) map[t.platform] = override;
    }
    return map;
  }, [previewTargets, overrides]);

  function toggle<T>(set: Set<T>, value: T, update: (next: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(next);
  }

  /** AI caption assist: draft from a topic, or improve/shorten/hashtag the current caption. */
  async function runAi(mode: 'draft' | 'improve' | 'shorten' | 'hashtags') {
    setAiBusy(mode);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, topic: aiTopic, text: body }),
      });
      const d = (await res.json().catch(() => null)) as { suggestion?: string; error?: string } | null;
      if (!res.ok) {
        setAiError(d?.error ?? 'AI request failed.');
        return;
      }
      const suggestion = (d?.suggestion ?? '').trim();
      if (!suggestion) return;
      if (mode === 'hashtags') setBody((b) => (b ? `${b}\n\n${suggestion}` : suggestion));
      else setBody(suggestion);
    } finally {
      setAiBusy(null);
    }
  }

  /** Edit mode: PATCH content/media/overrides/schedule; optionally publish after saving. */
  async function submitEdit(mode: 'draft' | 'schedule' | 'now') {
    if (!editId) return;
    setBusy(mode);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/posts/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          linkUrl: linkUrl || null,
          imageUrls: images,
          videoUrl: videoUrl || null,
          title: title || null,
          overrides,
          ...(mode === 'schedule' ? { scheduledAt: scheduledAt || null } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? 'Save failed.');
        return;
      }
      if (mode === 'now') {
        const pub = await fetch(`/api/posts/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'publish_now' }),
        });
        const pubData = (await pub.json().catch(() => null)) as { error?: string } | null;
        if (!pub.ok) {
          setError(pubData?.error ?? 'Saved, but publishing failed.');
          return;
        }
      }
      router.push('/posts');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function submit(mode: 'draft' | 'schedule' | 'now' | 'queue') {
    if (editId) {
      if (mode !== 'queue') await submitEdit(mode);
      return;
    }
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

  const targetsPicked = previewTargets.length > 0;
  const blocking = problems.filter((p) => !p.includes('not clickable'));
  const editLocked = editId !== null && (editStatus === 'published' || editStatus === 'publishing');

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

          {/* AI caption assist — drafts/refines text the human still edits before publishing. */}
          <div className="rounded-lg border p-2.5 space-y-2" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} style={{ color: 'var(--brand-primary)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>AI assist</span>
            </div>
            <div className="flex gap-2">
              <input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="Topic for a fresh caption…"
                className="flex-1 rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              />
              <Button type="button" size="sm" loading={aiBusy === 'draft'} disabled={!aiTopic.trim()} onClick={() => void runAi('draft')}>
                Draft
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" loading={aiBusy === 'improve'} disabled={!body.trim()} onClick={() => void runAi('improve')}>
                Improve
              </Button>
              <Button type="button" size="sm" variant="secondary" loading={aiBusy === 'shorten'} disabled={!body.trim()} onClick={() => void runAi('shorten')}>
                Shorten
              </Button>
              <Button type="button" size="sm" variant="secondary" loading={aiBusy === 'hashtags'} disabled={!body.trim()} onClick={() => void runAi('hashtags')}>
                Add hashtags
              </Button>
              {brandHashtags.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setBody((b) => `${b}${b.trim() ? '\n\n' : ''}${brandHashtags.join(' ')}`)}
                >
                  Brand hashtags
                </Button>
              )}
            </div>
            {aiError && <p className="text-xs" style={{ color: 'var(--color-error-text)' }}>{aiError}</p>}
            {snippets.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const s = snippets.find((x) => x.id === e.target.value);
                  if (s) setBody((b) => (b ? `${b}\n\n${s.body}` : s.body));
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              >
                <option value="">Insert a saved snippet…</option>
                {snippets.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            )}
          </div>

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
                <Button type="button" size="sm" variant="ghost" onClick={() => { setLibPicker(libPicker === 'image' ? null : 'image'); setCanvaOpen(false); }}>Library</Button>
                <Button type="button" size="sm" variant="ghost" onClick={toggleCanvaPicker}>Canva</Button>
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

          {/* Canva design picker — pull a synced design straight into this post */}
          {canvaOpen && (
            <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Canva designs</span>
                <button type="button" onClick={() => setCanvaOpen(false)} className="text-xs" style={{ color: 'var(--text-muted)' }}>close</button>
              </div>
              {canvaError && <p className="text-xs mb-2" style={{ color: 'var(--color-error-text)' }}>{canvaError}</p>}
              {canvaDesigns === null ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading designs…</p>
              ) : canvaDesigns.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  No designs synced yet. Sync your Canva folders on the{' '}
                  <a href="/canva" className="underline" style={{ color: 'var(--brand-primary)' }}>Canva designs</a> page, then try again.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                  {canvaDesigns.map((design) => (
                    <button
                      key={design.id}
                      type="button"
                      onClick={() => void prepareCanvaDesign(design)}
                      disabled={preparingId !== null}
                      title={design.title}
                      className="relative rounded-lg border overflow-hidden text-left disabled:opacity-60"
                      style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
                    >
                      <div className="aspect-square flex items-center justify-center overflow-hidden">
                        {design.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={design.thumbnailUrl} alt={design.title} className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff size={18} color="#64748b" />
                        )}
                      </div>
                      <span className="block px-1.5 py-1 text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{design.title}</span>
                      {preparingId === design.id && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium" style={{ backgroundColor: 'rgba(15,23,42,0.6)', color: '#fff' }}>Preparing…</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                Selecting a design renders it to an image and adds it to this post.
              </p>
            </div>
          )}

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

          <div className="pt-1">
            <Button type="button" variant="secondary" onClick={() => setPreviewOpen(true)}>
              <Eye size={15} className="mr-1.5" /> Preview per format
            </Button>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              See how this post is cropped and captioned on Instagram, Facebook, X, LinkedIn, TikTok and YouTube.
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        {editId ? (
          <Card title="Targets" description="Targets are fixed for an existing post — duplicate it in the composer to change them.">
            <div className="flex flex-wrap gap-2">
              {editTargets.map((t) => (
                <span key={t.key} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
                  {t.name}
                  <Badge variant="info">{PLATFORM_RULES[t.platform].label}</Badge>
                </span>
              ))}
              {editTargets.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
              )}
            </div>
            {editLocked && (
              <p className="mt-3 text-sm" style={{ color: 'var(--color-warning-text)' }}>
                This post is {editStatus} — its content can no longer be edited.
              </p>
            )}
          </Card>
        ) : (
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
        )}

        {targetsPicked && (
          <Card title="Per-network captions" description="Optional — leave blank to use the caption above. Tailor tone or hashtags per network.">
            <div className="space-y-3">
              {previewTargets.map((t) => (
                <div key={t.key}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                    <Badge variant="info">{PLATFORM_RULES[t.platform].label}</Badge>
                  </div>
                  <textarea
                    value={overrides[t.key] ?? ''}
                    onChange={(e) => setOverride(t.key, e.target.value)}
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

        {targetsPicked && (
          <Card title="Preview" description="How each network will show this post — captions, media, links and character limits.">
            <PreviewPanel
              targets={previewTargets}
              draft={{ body, images, videoUrl: videoUrl || null, title: title || null, linkUrl: linkUrl || null }}
              overrides={overrides}
            />
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
              <Button onClick={() => void submit('now')} disabled={!targetsPicked || blocking.length > 0 || editLocked} loading={busy === 'now'}>
                {editId ? 'Save & publish now' : 'Publish now'}
              </Button>
              <Button variant="secondary" onClick={() => void submit('schedule')} disabled={!targetsPicked || !scheduledAt || blocking.length > 0 || editLocked} loading={busy === 'schedule'}>
                {editId ? 'Save & schedule' : 'Schedule'}
              </Button>
              {!editId && (
                <Button variant="secondary" onClick={() => void submit('queue')} disabled={!targetsPicked || !nextSlot || blocking.length > 0} loading={busy === 'queue'}>
                  Add to queue
                </Button>
              )}
              <Button variant="ghost" onClick={() => void submit('draft')} disabled={!targetsPicked || editLocked} loading={busy === 'draft'}>
                {editId ? 'Save changes' : 'Save draft'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <FormatPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        draft={{ body, images, videoUrl: videoUrl || null, title: title || null, linkUrl: linkUrl || null }}
        captions={captionByPlatform}
      />
    </div>
  );
}
