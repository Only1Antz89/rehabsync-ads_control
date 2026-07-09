import { confirmSubscriber } from '@/lib/newsletters';
import { verifyEmailToken } from '@/lib/tokens';
import { Card, RehabSyncWordmark } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Double-opt-in confirmation landing page — works logged-out, idempotent. */
export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = verifyEmailToken('confirm', token);
  const confirmed = email ? await confirmSubscriber(email) : false;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4"
      style={{ backgroundColor: 'var(--brand-secondary)' }}
    >
      <RehabSyncWordmark color="#0d9488" badge="Ads Centre" />
      <Card className="w-full max-w-md text-center">
        <h1 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {confirmed ? 'Subscription confirmed' : 'Link not recognised'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {confirmed
            ? `Thanks — ${email} is now subscribed to the RehabSync newsletter. Every issue includes a one-click unsubscribe link.`
            : 'This confirmation link is invalid or has expired. You can sign up again to receive a fresh one.'}
        </p>
      </Card>
    </div>
  );
}
