import { Card } from '@/components/ui';

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Subscribers</h1>
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Consent-based subscriber lists with double-opt-in signup embed arrive in M3.
        </p>
      </Card>
    </div>
  );
}
