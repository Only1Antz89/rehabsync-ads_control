import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { isKnownJob, setCronEnabled } from '@/lib/cron';

type Params = { params: Promise<{ key: string }> };

/** Enable/disable a scheduled job (admin only). */
export async function PATCH(req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  const { key } = await params;
  if (!isKnownJob(key)) return NextResponse.json({ error: 'Unknown job.' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { enabled?: boolean } | null;
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: '`enabled` must be a boolean.' }, { status: 400 });
  }

  await setCronEnabled(key, body.enabled, session.email);
  await recordAudit(session, body.enabled ? 'cron_enabled' : 'cron_disabled', 'ads_cron_job', null, { key });
  return NextResponse.json({ ok: true });
}
