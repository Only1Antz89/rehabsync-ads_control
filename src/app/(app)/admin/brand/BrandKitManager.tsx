'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';

interface Brand {
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  voice: string | null;
  hashtags: string[];
  boilerplate: string | null;
}

export function BrandKitManager() {
  const [loaded, setLoaded] = useState(false);
  const [primary, setPrimary] = useState('#0d9488');
  const [secondary, setSecondary] = useState('#0f172a');
  const [logoUrl, setLogoUrl] = useState('');
  const [voice, setVoice] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [boilerplate, setBoilerplate] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/brand')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { brand: Brand }) => {
        const b = d.brand;
        if (b.primaryColor) setPrimary(b.primaryColor);
        if (b.secondaryColor) setSecondary(b.secondaryColor);
        setLogoUrl(b.logoUrl ?? '');
        setVoice(b.voice ?? '');
        setHashtags((b.hashtags ?? []).join(' '));
        setBoilerplate(b.boilerplate ?? '');
        setLoaded(true);
      })
      .catch(() => setError('Could not load the brand kit.'));
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryColor: primary,
          secondaryColor: secondary,
          logoUrl,
          voice,
          boilerplate,
          hashtags: hashtags.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean),
        }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(d?.error ?? 'Could not save.');
        return;
      }
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded && !error) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  const inputStyle = { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' } as const;

  return (
    <Card title="Brand kit" description="Used by the AI caption assist (voice) and the composer (hashtags).">
      <div className="space-y-4">
        {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

        <div className="flex flex-wrap gap-4">
          <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Primary colour
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="block mt-1 h-9 w-16 rounded border" style={inputStyle} />
          </label>
          <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Secondary colour
            <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="block mt-1 h-9 w-16 rounded border" style={inputStyle} />
          </label>
        </div>

        <Input label="Logo URL" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" />

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Brand voice</label>
          <textarea
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            rows={3}
            placeholder="Warm, encouraging, plain-English; celebrates small wins; never clinical or preachy."
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>The AI caption assist follows this voice.</p>
        </div>

        <Input label="Default hashtags (space or comma separated)" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#physio #rehab #movewell" />

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Boilerplate</label>
          <textarea
            value={boilerplate}
            onChange={(e) => setBoilerplate(e.target.value)}
            rows={2}
            placeholder="Standard sign-off or CTA appended to posts when you choose."
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} loading={busy}>Save brand kit</Button>
          {saved && <span className="text-sm" style={{ color: 'var(--color-success-text)' }}>Saved.</span>}
        </div>
      </div>
    </Card>
  );
}
