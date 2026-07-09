import { NextResponse } from 'next/server';
import { syncMetrics } from '@/lib/metrics';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel Cron target — hourly engagement + follower snapshots. CRON_SECRET-guarded. */
export async function GET(req: Request) {
  const secret = process.env['CRON_SECRET'];
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await syncMetrics();
  return NextResponse.json({ ok: true, ...result });
}
