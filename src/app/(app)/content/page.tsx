import { ContentLibrary } from './ContentLibrary';

export const dynamic = 'force-dynamic';

export default function ContentPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Content library
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Save reusable captions, hooks and CTAs, then drop them into the composer. Recycle evergreen
          posts from the Posts list.
        </p>
      </div>
      <ContentLibrary />
    </div>
  );
}
