import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { ApprovalsManager } from './ApprovalsManager';

export const dynamic = 'force-dynamic';

export default async function AdminApprovalsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Approvals
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Posts waiting for an admin. Approving a due scheduled post publishes it immediately;
          rejecting returns it to drafts with your note.
        </p>
      </div>
      <ApprovalsManager />
    </div>
  );
}
