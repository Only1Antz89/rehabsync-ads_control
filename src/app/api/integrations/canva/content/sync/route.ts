import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { syncCanvaContent } from '@/lib/canva/sync';

export const dynamic = 'force-dynamic';

/** Pull the latest designs from the mapped Canva folders into the library. Admin only. */
export async function POST() {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const result = await syncCanvaContent();
  await recordAudit(session, 'canva_content_synced', 'canva_content', null, {
    synced: result.synced,
    removed: result.removed,
    failedStages: result.failedStages,
  });
  if (!result.ok && result.error) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
