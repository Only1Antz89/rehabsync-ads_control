import { Composer } from './Composer';

export default function ComposerPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Composer
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Compose once, publish to every selected platform — validation runs per platform as you type.
        </p>
      </div>
      <Composer />
    </div>
  );
}
