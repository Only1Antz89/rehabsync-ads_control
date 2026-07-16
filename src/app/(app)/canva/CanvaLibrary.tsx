'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, X, ImageOff } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { CANVA_STAGES, type CanvaStage } from '@/db/schema';
import { CanvaPreviewGrid } from '@/components/canva/CanvaPreviewGrid';

interface ContentItem {
  id: string;
  title: string | null;
  stage: CanvaStage;
  stages: CanvaStage[];
  thumbnailUrl: string | null;
  lastSyncedAt: string;
}

const STAGE_LABEL: Record<CanvaStage, string> = {
  drafts: 'Drafts',
  ready: 'Ready to Publish',
  published: 'Published',
};
const STAGE_VARIANT: Record<CanvaStage, BadgeVariant> = {
  drafts: 'neutral',
  ready: 'info',
  published: 'success',
};

type Tab = CanvaStage | 'all';
const TABS: Tab[] = ['all', ...CANVA_STAGES];

export function CanvaLibrary({ admin }: { admin: boolean }) {
  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContentItem | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<{ url: string; reused: boolean } | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);

  const load = useCallback((which: Tab) => {
    setItems(null);
    const q = which === 'all' ? '' : `?stage=${which}`;
    fetch(`/api/integrations/canva/content${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((d: { items: ContentItem[] }) => setItems(d.items))
      .catch(() => setError('Could not load Canva designs.'));
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function sync() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/integrations/canva/content/sync', { method: 'POST' });
      const d = (await res.json().catch(() => null)) as
        | { synced?: number; removed?: number; failedStages?: string[]; error?: string }
        | null;
      if (!res.ok) {
        setError(d?.error ?? 'Sync failed. Check the Canva connection and folder mapping.');
        return;
      }
      const parts = [`${d?.synced ?? 0} synced`];
      if (d?.removed) parts.push(`${d.removed} removed`);
      if (d?.failedStages?.length) parts.push(`couldn’t read: ${d.failedStages.join(', ')}`);
      setNotice(`Sync complete — ${parts.join(', ')}.`);
      load(tab);
    } finally {
      setBusy(false);
    }
  }

  function openPreview(item: ContentItem) {
    setPreview(item);
    setPrepared(null);
    setPrepError(null);
  }

  async function prepare(item: ContentItem) {
    setPreparing(true);
    setPrepError(null);
    setPrepared(null);
    try {
      const res = await fetch(`/api/integrations/canva/content/${item.id}/prepare`, { method: 'POST' });
      const d = (await res.json().catch(() => null)) as { url?: string; reused?: boolean; error?: string } | null;
      if (!res.ok || !d?.url) {
        setPrepError(d?.error ?? 'Could not export this design from Canva.');
        return;
      }
      setPrepared({ url: d.url, reused: Boolean(d.reused) });
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
              style={tab === t
                ? { backgroundColor: 'var(--brand-primary)', color: '#fff' }
                : { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              {t === 'all' ? 'All' : STAGE_LABEL[t]}
            </button>
          ))}
        </div>
        {admin && (
          <Button variant="secondary" size="sm" loading={busy} onClick={sync}>
            <RefreshCw size={14} className="mr-1.5" /> Sync now
          </Button>
        )}
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
      {notice && <p className="text-sm" style={{ color: 'var(--color-success-text)' }}>{notice}</p>}

      {items === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading designs…</p>
      ) : items.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No designs here yet.{' '}
            {admin
              ? 'Connect Canva and map your folders in Administration → Canva, then Sync now.'
              : 'Ask an admin to connect Canva and sync the design folders.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openPreview(item)}
              className="text-left rounded-xl border overflow-hidden transition-all hover:shadow-md cursor-pointer"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}
            >
              <div className="aspect-video flex items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                {item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnailUrl} alt={item.title ?? ''} className="w-full h-full object-cover" />
                ) : (
                  <ImageOff size={22} color="#64748b" />
                )}
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {item.title || '(untitled design)'}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={STAGE_VARIANT[item.stage]}>{STAGE_LABEL[item.stage]}</Badge>
                  {item.stages
                    .filter((s) => s !== item.stage)
                    .map((s) => (
                      <Badge key={s} variant="neutral">also in {STAGE_LABEL[s]}</Badge>
                    ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
          style={{ backgroundColor: 'rgba(2,6,23,0.6)' }}
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl border my-8"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-secondary)' }}>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {preview.title || '(untitled design)'}
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Per-network placement preview · {STAGE_LABEL[preview.stage]}
                </p>
              </div>
              <button type="button" onClick={() => setPreview(null)} className="cursor-pointer shrink-0" aria-label="Close">
                <X size={20} color="var(--text-muted)" />
              </button>
            </div>
            <div className="p-5">
              <CanvaPreviewGrid thumbnailUrl={preview.thumbnailUrl} title={preview.title ?? ''} />
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-t" style={{ borderColor: 'var(--border-secondary)' }}>
              <div className="min-w-0">
                {prepError && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{prepError}</p>}
                {prepared ? (
                  <p className="text-sm" style={{ color: 'var(--color-success-text)' }}>
                    {prepared.reused ? 'Already exported — ' : 'Exported and saved to your media library. '}
                    Ready to drop into a post.
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Export renders this design and saves it to your media library so you can attach it to a post.
                  </p>
                )}
              </div>
              {prepared ? (
                <a
                  href={`/composer?image=${encodeURIComponent(prepared.url)}`}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg shrink-0"
                  style={{ backgroundColor: 'var(--brand-primary)', color: '#fff' }}
                >
                  Open in composer →
                </a>
              ) : (
                <Button loading={preparing} onClick={() => prepare(preview)} className="shrink-0">
                  Prepare for composer
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
