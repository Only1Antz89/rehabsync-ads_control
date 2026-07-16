import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { NetworksMatrix } from './NetworksMatrix';

export const dynamic = 'force-dynamic';

export default async function AdminNetworksPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Networks
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Per-network adapters power publishing, metrics and comment ingestion. Comment ingestion runs
          on the schedule (pausable under Automation) and needs REHABSYNC_INGEST_URL configured.
        </p>
      </div>
      <NetworksMatrix />
    </div>
  );
}
