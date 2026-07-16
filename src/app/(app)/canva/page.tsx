import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { CanvaLibrary } from './CanvaLibrary';

export const dynamic = 'force-dynamic';

export default async function CanvaLibraryPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Canva designs
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Browse designs synced from your Canva Drafts, Ready to Publish and Published folders. Open a
          design to preview exactly how it will be cropped on each social network before you publish.
        </p>
      </div>
      <CanvaLibrary admin={isAdmin(session)} />
    </div>
  );
}
