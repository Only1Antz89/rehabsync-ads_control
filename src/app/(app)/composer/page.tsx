import { Composer } from './Composer';

export const dynamic = 'force-dynamic';

export default async function ComposerPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {edit ? 'Edit post' : 'Composer'}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          {edit
            ? 'Update the content, media, per-network captions and schedule. Targets are fixed for an existing post.'
            : 'Compose once, publish to every selected platform — validation runs per platform as you type.'}
        </p>
      </div>
      <Composer editId={edit ?? null} />
    </div>
  );
}
