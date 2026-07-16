import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { CanvaSettings } from './CanvaSettings';

export const dynamic = 'force-dynamic';

export default async function AdminCanvaPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Canva
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Connect your shared Canva workspace and map the Drafts, Ready to Publish and Published
          folders. Designs from those folders flow into the composer for scheduling.
        </p>
      </div>
      <CanvaSettings />
    </div>
  );
}
