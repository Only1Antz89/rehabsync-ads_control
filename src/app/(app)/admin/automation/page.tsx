import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { AutomationManager } from './AutomationManager';

export const dynamic = 'force-dynamic';

export default async function AdminAutomationPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Automation
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Scheduled jobs run by the external cron service. Pause any job here to stop its work
          instantly — the scheduler keeps calling, but a paused job simply no-ops.
        </p>
      </div>
      <AutomationManager />
    </div>
  );
}
