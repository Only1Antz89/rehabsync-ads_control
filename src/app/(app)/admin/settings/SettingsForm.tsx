'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';

interface Settings {
  requireApproval: boolean;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  timezone: string;
}

export function SettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { settings: Settings }) => setSettings(d.settings))
      .catch(() => setError('Could not load settings.'));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; settings?: Settings } | null;
      if (!res.ok) {
        setError(body?.error ?? 'Save failed.');
        return;
      }
      if (body?.settings) setSettings(body.settings);
      setNotice('Settings saved.');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error ?? 'Loading…'}</p>;
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card
        title="Approval workflow"
        description="When on, posts created by the `user` role wait for an admin before they can publish. Admins' posts are unaffected."
      >
        <label className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-primary)' }}>
          <input
            type="checkbox"
            checked={settings.requireApproval}
            onChange={(e) => setSettings({ ...settings, requireApproval: e.target.checked })}
            className="h-4 w-4"
          />
          Require admin approval for posts by the user role
        </label>
      </Card>

      <Card
        title="UTM defaults"
        description="Appended to outbound post links at publish time. UTM parameters already on a link always win."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="utm_source"
            value={settings.utmSource}
            onChange={(e) => setSettings({ ...settings, utmSource: e.target.value })}
            placeholder="adscentre"
          />
          <Input
            label="utm_medium"
            value={settings.utmMedium}
            onChange={(e) => setSettings({ ...settings, utmMedium: e.target.value })}
            placeholder="social"
          />
          <Input
            label="utm_campaign"
            value={settings.utmCampaign}
            onChange={(e) => setSettings({ ...settings, utmCampaign: e.target.value })}
            placeholder="always-on"
          />
        </div>
      </Card>

      <Card title="Timezone" description="Used for displaying schedules (IANA name, e.g. Europe/London).">
        <div className="max-w-xs">
          <Input
            label="Timezone"
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            placeholder="Europe/London"
          />
        </div>
      </Card>

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
      {notice && <p className="text-sm" style={{ color: 'var(--color-success-text)' }}>{notice}</p>}
      <Button type="submit" loading={busy}>Save settings</Button>
    </form>
  );
}
