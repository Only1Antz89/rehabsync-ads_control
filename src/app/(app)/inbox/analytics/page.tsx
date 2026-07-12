import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { InboxAnalyticsClient } from './InboxAnalyticsClient';

export const dynamic = 'force-dynamic';

export default async function InboxAnalyticsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Inbox insights
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Engagement volume, response rate and speed across your connected networks.
        </p>
      </div>
      <InboxAnalyticsClient />
    </div>
  );
}
