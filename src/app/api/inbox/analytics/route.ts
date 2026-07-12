import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { loadInboxAnalytics } from '@/lib/inbox-analytics';

export const dynamic = 'force-dynamic';

/** Aggregate engagement metrics for the inbox. */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  return NextResponse.json(await loadInboxAnalytics());
}
