import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { UserManager } from './UserManager';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Users &amp; Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Manage who can access the Ads Centre and what they can do.
        </p>
      </div>
      <UserManager selfUserId={session.userId} />
    </div>
  );
}
