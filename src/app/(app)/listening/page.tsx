import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ListeningClient } from './ListeningClient';

export const dynamic = 'force-dynamic';

export default async function ListeningPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Social listening
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Track brand terms, hashtags and competitors across networks. Mentions are matched to your
          streams, sentiment-scored, and triaged here.
        </p>
      </div>
      <ListeningClient />
    </div>
  );
}
