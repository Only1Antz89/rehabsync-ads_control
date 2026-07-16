import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { listAdapters } from '@/lib/social/adapters';

export const dynamic = 'force-dynamic';

/** The per-network capability matrix (publish / metrics / comment-ingestion). */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const networks = listAdapters().map((a) => ({ platform: a.platform, label: a.label, ...a.capabilities }));
  return NextResponse.json({ networks });
}
