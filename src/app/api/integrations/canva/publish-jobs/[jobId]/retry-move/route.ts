import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { retryMove } from '@/lib/canva/publish';

export const dynamic = 'force-dynamic';

/** Retry only the Ready → Published folder move for a fully-published publish job. */
export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const { jobId } = await params;
  const result = await retryMove(jobId);
  await recordAudit(session, 'canva_move_retried', 'canva_publish_job', jobId, {
    ok: result.ok,
    ...(result.ok ? { moveStatus: result.moveStatus } : { error: result.error }),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
