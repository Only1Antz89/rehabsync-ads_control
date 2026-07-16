'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui';

interface Network {
  platform: string;
  label: string;
  publish: boolean;
  metrics: boolean;
  comments: boolean;
}

function Tick({ on }: { on: boolean }) {
  return (
    <span style={{ color: on ? 'var(--color-success-text)' : 'var(--text-muted)' }}>{on ? '✓' : '—'}</span>
  );
}

export function NetworksMatrix() {
  const [networks, setNetworks] = useState<Network[] | null>(null);

  useEffect(() => {
    fetch('/api/networks')
      .then((r) => (r.ok ? r.json() : { networks: [] }))
      .then((d: { networks: Network[] }) => setNetworks(d.networks))
      .catch(() => setNetworks([]));
  }, []);

  return (
    <Card title="Network capabilities" description="What each connected network supports today. Ingestion pulls new comments into the inbox on the schedule.">
      {networks === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-primary)' }}>
                <th className="px-4 py-2">Network</th>
                <th className="px-4 py-2 text-center">Publish</th>
                <th className="px-4 py-2 text-center">Metrics</th>
                <th className="px-4 py-2 text-center">Comment ingestion</th>
              </tr>
            </thead>
            <tbody>
              {networks.map((n) => (
                <tr key={n.platform} className="border-b last:border-0" style={{ borderColor: 'var(--border-secondary)' }}>
                  <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>{n.label}</td>
                  <td className="px-4 py-2 text-center"><Tick on={n.publish} /></td>
                  <td className="px-4 py-2 text-center"><Tick on={n.metrics} /></td>
                  <td className="px-4 py-2 text-center"><Tick on={n.comments} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
