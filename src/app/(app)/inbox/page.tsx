import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { InboxClient } from './InboxClient';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Inbox
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Comments, mentions and messages from every connected network in one place. Triage, assign
          and reply without leaving RehabSync.
        </p>
      </div>
      <InboxClient me={session.email} />
    </div>
  );
}
