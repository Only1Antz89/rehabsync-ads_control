import { NextResponse } from 'next/server';
import { guardedRun } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Refresh the Canva design library from the mapped folders. CRON_SECRET-guarded; drive from the
 *  external scheduler. No-ops when the `canva-sync` job is paused in /admin/automation. */
export async function GET(req: Request) {
  const secret = process.env['CRON_SECRET'];
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await guardedRun('canva-sync'));
}
