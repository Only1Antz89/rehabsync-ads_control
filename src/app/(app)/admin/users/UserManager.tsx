'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';

interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
}

export function UserManager({ selfUserId }: { selfUserId: string | null }) {
  const [users, setUsers] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');

  const load = useCallback(() => {
    fetch('/api/admin/users')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { users: StaffRow[] }) => setUsers(d.users))
      .catch(() => setError('Could not load users.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Create failed.');
        return;
      }
      setName('');
      setEmail('');
      setPassword('');
      setRole('user');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, patchBody: { role?: string; status?: string }) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Update failed.');
        return;
      }
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="Invite a user"
        description="Creates a Ads Centre account. Share the password securely — they can be rotated here later."
      >
        <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input
            label="Temporary password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="Minimum 10 characters."
            required
          />
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'user')}
              className="block w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="user">User — works leads, drafts campaigns</option>
              <option value="admin">Admin — plus users, settings, sending</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy === 'create'}>
              Create user
            </Button>
          </div>
        </form>
      </Card>

      {error && (
        <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>
          {error}
        </p>
      )}

      <Card title="Ads Centre users" description="Platform super-admins are not listed — they always have full access via SSO.">
        {users === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading…
          </p>
        ) : users.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No staff users yet — invite your first above.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            {users.map((user) => (
              <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {user.name}
                    {user.id === selfUserId && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {' '}
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {user.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={user.role === 'admin' ? 'info' : 'neutral'}>{user.role}</Badge>
                  <Badge variant={user.status === 'active' ? 'success' : 'error'}>{user.status}</Badge>
                  {user.id !== selfUserId && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === user.id}
                        onClick={() => patch(user.id, { role: user.role === 'admin' ? 'user' : 'admin' })}
                      >
                        Make {user.role === 'admin' ? 'user' : 'admin'}
                      </Button>
                      <Button
                        size="sm"
                        variant={user.status === 'active' ? 'danger' : 'secondary'}
                        disabled={busy === user.id}
                        onClick={() =>
                          patch(user.id, { status: user.status === 'active' ? 'disabled' : 'active' })
                        }
                      >
                        {user.status === 'active' ? 'Disable' : 'Enable'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
