import { RehabSyncWordmark } from '@/components/ui';
import { SubscribeForm } from './SubscribeForm';

export const dynamic = 'force-dynamic';

/** Hosted newsletter signup (public). Double opt-in: a confirmation email seals the consent. */
export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>;
}) {
  const { src } = await searchParams;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4"
      style={{ backgroundColor: 'var(--brand-secondary)' }}
    >
      <RehabSyncWordmark color="#0d9488" badge="Ads Centre" />
      <SubscribeForm source={src?.slice(0, 60) ?? 'hosted_page'} />
      <p className="text-xs max-w-md text-center" style={{ color: 'rgba(148,163,184,0.8)' }}>
        We only email people who ask us to. You will get a confirmation email first, and every issue
        has a one-click unsubscribe.
      </p>
    </div>
  );
}
