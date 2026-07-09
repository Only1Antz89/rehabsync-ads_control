import { getSession, isAdmin } from '@/lib/auth';
import { NewslettersManager } from './NewslettersManager';

export const dynamic = 'force-dynamic';

export default async function NewslettersPage() {
  const session = await getSession();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Newsletters
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Compose, test-send and ship issues to the consent-based list via SMTP2GO. Suppressed and
          unsubscribed addresses are excluded at send time, every time.
        </p>
      </div>
      <NewslettersManager isAdmin={session ? isAdmin(session) : false} />
    </div>
  );
}
