'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge, Button, Card } from '@/components/ui';

interface Account {
  id: string;
  platform: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  connectedBy: string | null;
}

// Lettered platform marks (the pinned lucide version ships no brand icons).
const PLATFORM_MARKS: Record<string, { initials: string; bg: string }> = {
  facebook: { initials: 'f', bg: '#1877f2' },
  instagram: { initials: 'IG', bg: '#c13584' },
  linkedin: { initials: 'in', bg: '#0a66c2' },
  youtube: { initials: 'YT', bg: '#ff0000' },
  tiktok: { initials: 'TT', bg: '#010101' },
  x: { initials: 'X', bg: '#111111' },
};

const ERRORS: Record<string, string> = {
  forbidden: 'Only admins can connect accounts.',
  meta_not_configured: 'META_APP_ID / META_APP_SECRET are not set — add them to the environment first.',
  state_mismatch: 'The sign-in flow expired or was tampered with — try again.',
  denied: 'Meta authorisation was declined.',
  no_pages: 'No Facebook Pages found on that Meta account — the app needs a Page (and optionally a linked Instagram Business account).',
  exchange_failed: 'Connecting failed while talking to Meta — check the app credentials and try again.',
};

export function ConnectionsManager() {
  const params = useSearchParams();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const error = params.get('error');
  const connected = params.get('connected');

  const load = useCallback(() => {
    fetch('/api/accounts')
      .then((res) => (res.ok ? res.json() : { accounts: [] }))
      .then((d: { accounts: Account[] }) => setAccounts(d.accounts))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function disconnect(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border-l-4 p-3 text-sm" style={{ borderColor: 'var(--color-error)', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error-text)' }}>
          {ERRORS[error] ?? 'Something went wrong.'}
        </p>
      )}
      {connected && (
        <p className="rounded-lg border-l-4 p-3 text-sm" style={{ borderColor: 'var(--color-success)', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success-text)' }}>
          Connected {connected} account{connected === '1' ? '' : 's'}.
        </p>
      )}

      <Card
        title="Meta — Facebook Pages & Instagram Business"
        description="One connection brings in your Pages and any linked Instagram Business accounts. Tokens are encrypted at rest."
      >
        <a
          href="/api/oauth/meta/start"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: '#1877f2' }}
        >
          <span className="text-sm font-bold">f</span> Connect with Meta
        </a>
      </Card>

      <Card title="Connected accounts">
        {accounts === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nothing connected yet. Unconnected platforms still work in the composer via manual-export.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            {accounts.map((account) => {
              const mark = PLATFORM_MARKS[account.platform] ?? { initials: '?', bg: '#64748b' };
              return (
                <li key={account.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full shrink-0 text-[11px] font-bold text-white"
                      style={{ backgroundColor: mark.bg }}
                    >
                      {mark.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{account.displayName}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {account.platform} · connected by {account.connectedBy ?? '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={account.status === 'connected' ? 'success' : 'error'}>{account.status}</Badge>
                    {account.status === 'connected' && (
                      <Button size="sm" variant="secondary" disabled={busy === account.id} onClick={() => void disconnect(account.id)}>
                        Disconnect
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Coming next">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          LinkedIn (M3 — API access request pending), TikTok &amp; YouTube (M4 — video pipeline). Until then
          they publish via the manual-export checklist, and X stays manual-export by choice.
        </p>
      </Card>
    </div>
  );
}
