import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { ConnectionsManager } from './ConnectionsManager';

export const dynamic = 'force-dynamic';

export default async function ConnectionsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Connections
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Connect the company&apos;s social accounts. Admin-only; OAuth tokens are encrypted at rest.
        </p>
      </div>
      <Suspense>
        <ConnectionsManager />
      </Suspense>
    </div>
  );
}
