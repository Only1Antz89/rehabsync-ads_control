import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { BrandKitManager } from './BrandKitManager';

export const dynamic = 'force-dynamic';

export default async function AdminBrandPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Brand kit
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Your brand voice, colours, logo and default hashtags — kept consistent across everything you
          publish. The AI caption assist writes in this voice; the composer can drop in your hashtags.
        </p>
      </div>
      <BrandKitManager />
    </div>
  );
}
