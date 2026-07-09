import { NextResponse } from 'next/server';
import { publishDuePosts } from '@/lib/publisher';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel Cron target (see vercel.json) — publishes due scheduled posts. CRON_SECRET-guarded. */
export async function GET(req: Request) {
  const secret = process.env['CRON_SECRET'];
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await publishDuePosts();
  return NextResponse.json({ ok: true, ...result });
}
