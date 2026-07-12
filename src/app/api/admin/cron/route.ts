import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { listCronJobs } from '@/lib/cron';

export const dynamic = 'force-dynamic';

/** Cron jobs with their enabled state + last-run telemetry (admin only). */
export async function GET() {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  return NextResponse.json({ jobs: await listCronJobs() });
}
