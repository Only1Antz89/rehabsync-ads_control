'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input, RehabSyncWordmark } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Sign in failed. Please try again.');
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Sign in
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Staff access to the RehabSync Ads Centre.
          </p>
        </div>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          RehabSync platform admin? You&apos;re signed in automatically —{' '}
          <a href="/dashboard" className="underline" style={{ color: 'var(--brand-primary)' }}>
            continue to the dashboard
          </a>
          .
        </p>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4"
      style={{ backgroundColor: 'var(--brand-secondary)' }}
    >
      <RehabSyncWordmark color="#0d9488" badge="Ads Centre" />
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="text-xs text-white/40">IntAillium internal tool — authorised staff only.</p>
    </div>
  );
}
