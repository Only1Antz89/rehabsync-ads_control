import { Card } from '@/components/ui';

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Composer</h1>
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Compose once, publish to Facebook, Instagram, LinkedIn and more — arrives in M1 with Meta connected first and manual-export mode for every other platform.
        </p>
      </Card>
    </div>
  );
}
