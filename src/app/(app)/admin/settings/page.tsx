import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Tool-wide defaults: UTM tagging on outbound links, the approval workflow and the display
          timezone.
        </p>
      </div>
      <SettingsForm />
    </div>
  );
}
