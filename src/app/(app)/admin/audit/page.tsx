import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { AuditLogViewer } from './AuditLogViewer';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Audit log
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Every mutation in the Ads Centre — who did what, and when.
        </p>
      </div>
      <AuditLogViewer />
    </div>
  );
}
