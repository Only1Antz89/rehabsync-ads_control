import { unsubscribeEmail } from '@/lib/newsletters';
import { verifyEmailToken } from '@/lib/tokens';
import { Card, RehabSyncWordmark } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** One-click unsubscribe — must work logged-out, idempotent, and never reveal list membership. */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = verifyEmailToken('unsubscribe', token);

  let message = 'This unsubscribe link is invalid or has expired.';
  if (email) {
    await unsubscribeEmail(email, 'unsubscribe_link');
    message = `${email} has been unsubscribed. You won't receive further newsletters from RehabSync.`;
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4"
      style={{ backgroundColor: 'var(--brand-secondary)' }}
    >
      <RehabSyncWordmark color="#0d9488" badge="Ads Centre" />
      <Card className="w-full max-w-md text-center">
        <h1 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {email ? 'Unsubscribed' : 'Link not recognised'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>
      </Card>
    </div>
  );
}
