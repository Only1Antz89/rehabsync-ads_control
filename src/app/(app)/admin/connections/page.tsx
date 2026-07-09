import { Card } from '@/components/ui';

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Connections</h1>
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Social account connections (Meta first, then LinkedIn, TikTok, YouTube) arrive in M1. Connecting is admin-only; OAuth tokens are encrypted at rest.
        </p>
      </Card>
    </div>
  );
}
