'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';

interface Competitor {
  id: string;
  name: string;
  terms: string[];
  isOwn: boolean;
}

interface SovBrand extends Competitor {
  mentions: number;
  sharePct: number;
}

interface Sov {
  days: number;
  totalMentions: number;
  brands: SovBrand[];
  ownSharePct: number;
}

export function ShareOfVoice() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [sov, setSov] = useState<Sov | null>(null);
  const [name, setName] = useState('');
  const [terms, setTerms] = useState('');
  const [isOwn, setIsOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/competitors')
      .then((r) => (r.ok ? r.json() : { competitors: [] }))
      .then((d: { competitors: Competitor[] }) => setCompetitors(d.competitors))
      .catch(() => undefined);
    fetch('/api/listening/share-of-voice')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Sov | null) => setSov(d))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, terms: terms.split(',').map((t) => t.trim()).filter(Boolean), isOwn }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(d?.error ?? 'Could not add the brand.');
        return;
      }
      setName('');
      setTerms('');
      setIsOwn(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/competitors/${id}`, { method: 'DELETE' }).catch(() => undefined);
    load();
  }

  const maxShare = Math.max(1, ...(sov?.brands ?? []).map((b) => b.sharePct));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card title="Tracked brands" description="Your brand (mark ‘This is us’) and competitors, each with terms to match in mentions.">
        <form onSubmit={add} className="space-y-2 mb-4">
          <Input label="Brand name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Terms to match (comma separated)" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="rehabsync, rehab sync, @rehabsync" />
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={isOwn} onChange={(e) => setIsOwn(e.target.checked)} /> This is us
          </label>
          {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
          <Button type="submit" loading={busy}>Add brand</Button>
        </form>
        {competitors.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No brands tracked yet.</p>
        ) : (
          <ul className="space-y-2">
            {competitors.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</span>{' '}
                  {c.isOwn && <Badge variant="success">us</Badge>}
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.terms.join(', ')}</p>
                </div>
                <button type="button" onClick={() => void remove(c.id)} className="text-xs cursor-pointer shrink-0" style={{ color: 'var(--color-error-text)' }}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Share of voice" description={sov ? `Last ${sov.days} days · ${sov.totalMentions} matched mentions` : 'Loading…'}>
        {!sov || sov.brands.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Add brands and let listening mentions come in to see share of voice.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Your share: <span className="font-semibold" style={{ color: 'var(--brand-primary)' }}>{sov.ownSharePct}%</span>
            </div>
            {sov.brands.map((b) => (
              <div key={b.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: 'var(--text-primary)' }}>{b.name}{b.isOwn ? ' (us)' : ''}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{b.mentions} · {b.sharePct}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(b.sharePct / maxShare) * 100}%`, backgroundColor: b.isOwn ? 'var(--brand-primary)' : 'var(--text-muted)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
