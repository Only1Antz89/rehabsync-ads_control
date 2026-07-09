import { Card } from '@/components/ui';

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Newsletters</h1>
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Newsletter composer, SMTP2GO sends and per-issue analytics arrive in M3.
        </p>
      </Card>
    </div>
  );
}
