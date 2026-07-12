import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { QueueManager } from './QueueManager';

export const dynamic = 'force-dynamic';

export default async function AdminQueuePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Posting queue
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Set the times you want to post each week. In the composer, “Add to queue” drops a post into
          the next free slot. Times are UTC.
        </p>
      </div>
      <QueueManager />
    </div>
  );
}
