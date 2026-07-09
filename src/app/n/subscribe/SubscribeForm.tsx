'use client';

import React, { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';

export function SubscribeForm({ source }: { source: string }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/public/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, source }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Could not subscribe — try again.');
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="w-full max-w-md text-center">
        <h1 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Check your inbox
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          If {email} is new to our list, we&apos;ve sent a confirmation link — click it and you&apos;re
          subscribed.
        </p>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        RehabSync newsletter
      </h1>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Product updates and physio-clinic insights, roughly monthly.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@clinic.co.uk"
        />
        <Input label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
        <Button type="submit" loading={busy} className="w-full">
          Subscribe
        </Button>
      </form>
    </Card>
  );
}
