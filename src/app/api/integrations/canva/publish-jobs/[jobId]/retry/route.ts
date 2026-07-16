import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { retryPublishJob } from '@/lib/canva/publish';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Retry the failed targets of a publish job, then re-evaluate the Ready → Published move. */
export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const { jobId } = await params;
  const result = await retryPublishJob(jobId);
  await recordAudit(session, 'canva_publish_retried', 'canva_publish_job', jobId, {
    ok: result.ok,
    ...(result.ok ? { status: result.status, moveStatus: result.moveStatus } : { error: result.error }),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
