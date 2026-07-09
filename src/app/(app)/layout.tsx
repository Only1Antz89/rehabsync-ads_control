import { redirect } from 'next/navigation';
import React from 'react';
import { getSession } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <Sidebar
        user={{
          name: session.name,
          email: session.email,
          role: session.role,
          kind: session.kind,
        }}
      />
      <main className="lg:pl-64">
        <div className="px-6 py-8 pt-16 lg:pt-8 max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
