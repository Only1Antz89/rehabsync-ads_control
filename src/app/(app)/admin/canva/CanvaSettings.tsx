'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface Folder {
  kind: string;
  id: string;
  name: string;
}

interface Status {
  configured: boolean;
  connection: { status: string; scopes: string[]; connectedBy: string | null; lastError: string | null; updatedAt: string };
  settings: {
    draftsFolderId: string | null;
    draftsFolderName: string | null;
    readyFolderId: string | null;
    readyFolderName: string | null;
    publishedFolderId: string | null;
    publishedFolderName: string | null;
    lastValidatedAt: string | null;
  };
}

type Stage = 'drafts' | 'ready' | 'published';
const STAGES: { key: Stage; label: string }[] = [
  { key: 'drafts', label: 'Drafts' },
  { key: 'ready', label: 'Ready to Publish' },
  { key: 'published', label: 'Published' },
];

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  connected: 'success',
  disconnected: 'neutral',
  token_expired: 'warning',
  reauthorisation_required: 'warning',
  error: 'error',
};

export function CanvaSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [picker, setPicker] = useState<Stage | null>(null);
  const [parent, setParent] = useState('root');
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [pick, setPick] = useState<Record<Stage, { id: string; name: string } | null>>({ drafts: null, ready: null, published: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/integrations/canva/status')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((d: Status) => {
        setStatus(d);
        setPick({
          drafts: d.settings.draftsFolderId ? { id: d.settings.draftsFolderId, name: d.settings.draftsFolderName ?? d.settings.draftsFolderId } : null,
          ready: d.settings.readyFolderId ? { id: d.settings.readyFolderId, name: d.settings.readyFolderName ?? d.settings.readyFolderId } : null,
          published: d.settings.publishedFolderId ? { id: d.settings.publishedFolderId, name: d.settings.publishedFolderName ?? d.settings.publishedFolderId } : null,
        });
      })
      .catch(() => setError('Could not load Canva settings.'));
  }, []);

  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected')) setNotice('Canva connected.');
    if (q.get('error')) setError(`Canva connection failed: ${q.get('error')}`);
  }, [load]);

  const openPicker = (stage: Stage) => {
    setPicker(stage);
    setParent('root');
    setTrail([]);
    loadFolders('root');
  };
  function loadFolders(parentId: string) {
    setFolders(null);
    fetch(`/api/integrations/canva/folders?parent=${encodeURIComponent(parentId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('folders'))))
      .then((d: { folders: Folder[] }) => setFolders(d.folders))
      .catch(() => setFolders([]));
  }
  const drill = (f: Folder) => {
    setTrail((t) => [...t, { id: parent, name: trail.length === 0 ? 'Root' : trail[trail.length - 1]!.name }]);
    setParent(f.id);
    loadFolders(f.id);
  };
  const up = () => {
    const prev = trail[trail.length - 1];
    setTrail((t) => t.slice(0, -1));
    const p = prev?.id ?? 'root';
    setParent(p);
    loadFolders(p);
  };
  const choose = (f: Folder) => {
    if (picker) setPick((p) => ({ ...p, [picker]: { id: f.id, name: f.name } }));
    setPicker(null);
  };

  async function save() {
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/integrations/canva/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftsFolderId: pick.drafts?.id ?? null,
          draftsFolderName: pick.drafts?.name ?? null,
          readyFolderId: pick.ready?.id ?? null,
          readyFolderName: pick.ready?.name ?? null,
          publishedFolderId: pick.published?.id ?? null,
          publishedFolderName: pick.published?.name ?? null,
        }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(d?.error ?? 'Could not save.');
        return;
      }
      setNotice('Folder mapping saved. Run Test connection to validate.');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/integrations/canva/test', { method: 'POST' });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; results?: { stage: string; ok: boolean }[] } | null;
      if (d?.ok) setNotice('Connection and all mapped folders are reachable. ✓');
      else setError(d?.error ?? `Some folders were not reachable: ${(d?.results ?? []).filter((r) => !r.ok).map((r) => r.stage).join(', ') || 'check mapping'}`);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Canva? Folder sync and publishing from Canva will stop until you reconnect.')) return;
    setBusy('disc');
    try {
      await fetch('/api/integrations/canva/disconnect', { method: 'POST' }).catch(() => undefined);
      load();
    } finally {
      setBusy(null);
    }
  }

  if (!status && !error) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  const connected = status?.connection.status === 'connected';

  return (
    <div className="space-y-5">
      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
      {notice && <p className="text-sm" style={{ color: 'var(--color-success-text)' }}>{notice}</p>}

      <Card title="Connection">
        {!status?.configured ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Canva isn’t configured on the server yet. Set <code>CANVA_CLIENT_ID</code>, <code>CANVA_CLIENT_SECRET</code>{' '}
            and <code>CANVA_REDIRECT_URI</code>, then reload.
          </p>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant={STATUS_VARIANT[status?.connection.status ?? 'disconnected'] ?? 'neutral'}>
              {status?.connection.status.replace(/_/g, ' ')}
            </Badge>
            {status?.connection.connectedBy && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>by {status.connection.connectedBy}</span>
            )}
            {connected ? (
              <Button variant="secondary" size="sm" loading={busy === 'disc'} onClick={disconnect}>Disconnect</Button>
            ) : (
              <a
                href="/api/integrations/canva/connect"
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg"
                style={{ backgroundColor: 'var(--brand-primary)', color: '#fff' }}
              >
                {status?.connection.status === 'reauthorisation_required' ? 'Reconnect Canva' : 'Connect Canva'}
              </a>
            )}
            {status?.connection.lastError && (
              <span className="text-xs" style={{ color: 'var(--color-error-text)' }}>{status.connection.lastError}</span>
            )}
          </div>
        )}
      </Card>

      <Card title="Folder mapping" description="Map your Social Content folders. Each stage must use a different Canva folder.">
        <div className="space-y-3">
          {STAGES.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.label}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{pick[s.key]?.name ?? 'Not set'}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={!connected} onClick={() => openPicker(s.key)}>Choose folder</Button>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <Button loading={busy === 'save'} disabled={!connected} onClick={save}>Save mapping</Button>
            <Button variant="secondary" loading={busy === 'test'} disabled={!connected} onClick={test}>Test connection</Button>
            {status?.settings.lastValidatedAt && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Last validated {new Date(status.settings.lastValidatedAt).toLocaleString('en-GB')}
              </span>
            )}
          </div>
        </div>
      </Card>

      {picker && (
        <Card title={`Choose the ${STAGES.find((s) => s.key === picker)?.label} folder`}>
          <div className="flex items-center gap-2 mb-3 text-sm">
            <button type="button" onClick={up} disabled={trail.length === 0} className="cursor-pointer disabled:opacity-40" style={{ color: 'var(--brand-primary)' }}>
              ← Back
            </button>
            <span style={{ color: 'var(--text-muted)' }}>· {parent === 'root' ? 'Root' : 'Sub-folder'}</span>
            <button type="button" onClick={() => setPicker(null)} className="ml-auto cursor-pointer text-xs" style={{ color: 'var(--text-muted)' }}>Cancel</button>
          </div>
          {folders === null ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading folders…</p>
          ) : folders.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No sub-folders here.</p>
          ) : (
            <ul className="space-y-1">
              {folders.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-secondary)' }}>
                  <button type="button" onClick={() => drill(f)} className="text-sm text-left cursor-pointer" style={{ color: 'var(--text-primary)' }}>📁 {f.name}</button>
                  <Button size="sm" onClick={() => choose(f)}>Use this</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
