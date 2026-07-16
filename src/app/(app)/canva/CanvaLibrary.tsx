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

interface Account {
  id: string;
  displayName: string;
  platform: string;
  status: string;
}
interface PublishResult {
  jobId: string;
  status: string;
  moveStatus: string;
  moveError?: string;
}
const PUB_VARIANT: Record<string, BadgeVariant> = {
  published: 'success',
  partial: 'warning',
  failed: 'error',
  awaiting_approval: 'info',
  publishing: 'info',
};
const MOVE_VARIANT: Record<string, BadgeVariant> = {
  moved: 'success',
  not_needed: 'neutral',
  skipped: 'neutral',
  pending: 'neutral',
  failed: 'error',
};

/** Publish a prepared design to connected networks; on full success it auto-moves to Published. */
function CanvaPublishPanel({ item }: { item: ContentItem }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState<'publish' | 'retry' | 'move' | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts: Account[] }) => setAccounts(d.accounts.filter((a) => a.status === 'connected')))
      .catch(() => setAccounts([]));
  }, []);

  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function call(url: string, kind: 'publish' | 'retry' | 'move', payload?: unknown) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: payload ? { 'Content-Type': 'application/json' } : {},
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const d = (await res.json().catch(() => null)) as (PublishResult & { error?: string }) | null;
      if (!res.ok || !d) {
        setError(d?.error ?? 'Something went wrong.');
        return;
      }
      setResult({ jobId: d.jobId, status: d.status, moveStatus: d.moveStatus, moveError: d.moveError });
    } finally {
      setBusy(null);
    }
  }

  const publish = () => call(`/api/integrations/canva/content/${item.id}/publish`, 'publish', { accountIds: [...sel], body: caption });
  const retry = () => result && call(`/api/integrations/canva/publish-jobs/${result.jobId}/retry`, 'retry');
  const retryMove = () => result && call(`/api/integrations/canva/publish-jobs/${result.jobId}/retry-move`, 'move');

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Publish to networks</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Publishes the prepared design. Once every target succeeds, the design moves itself from Ready to Published in Canva.
        </p>
      </div>

      {accounts === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading connected accounts…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No connected accounts. Connect one under Administration → Connections.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer"
              style={sel.has(a.id)
                ? { backgroundColor: 'var(--brand-primary)', color: '#fff', borderColor: 'var(--brand-primary)' }
                : { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
            >
              {a.displayName} · {a.platform}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={2}
        placeholder="Caption (optional)"
        className="w-full rounded-lg border px-3 py-2 text-sm"
        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
      />

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      {result && (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>Publish:</span>
          <Badge variant={PUB_VARIANT[result.status] ?? 'neutral'}>{result.status.replace(/_/g, ' ')}</Badge>
          <span style={{ color: 'var(--text-secondary)' }}>Folder move:</span>
          <Badge variant={MOVE_VARIANT[result.moveStatus] ?? 'neutral'}>{result.moveStatus.replace(/_/g, ' ')}</Badge>
          {result.moveError && <span className="text-xs" style={{ color: 'var(--color-error-text)' }}>{result.moveError}</span>}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button loading={busy === 'publish'} disabled={sel.size === 0} onClick={publish}>Publish now</Button>
        {result && result.status !== 'published' && result.status !== 'awaiting_approval' && (
          <Button variant="secondary" loading={busy === 'retry'} onClick={retry}>Retry failed targets</Button>
        )}
        {result && result.status === 'published' && result.moveStatus === 'failed' && (
          <Button variant="secondary" loading={busy === 'move'} onClick={retryMove}>Retry folder move</Button>
        )}
      </div>
    </div>
  );
}

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
            <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border-secondary)' }}>
              <CanvaPublishPanel item={preview} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
