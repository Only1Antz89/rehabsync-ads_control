import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { isKnownJob, runJob } from '@/lib/cron';

type Params = { params: Promise<{ key: string }> };

/** Manually run a job now, regardless of its enabled state (admin only). */
export async function POST(_req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  const { key } = await params;
  if (!isKnownJob(key)) return NextResponse.json({ error: 'Unknown job.' }, { status: 404 });

  const result = await runJob(key);
  await recordAudit(session, 'cron_ran', 'ads_cron_job', null, { key, ok: result.ok });
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Run failed.' }, { status: 502 });
  return NextResponse.json({ ok: true, detail: result.detail ?? {} });
}
