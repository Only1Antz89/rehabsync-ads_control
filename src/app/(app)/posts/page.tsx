import { Card } from '@/components/ui';

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Posts</h1>
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Post list with per-platform publish status and errors arrives in M1.
        </p>
      </Card>
    </div>
  );
}
