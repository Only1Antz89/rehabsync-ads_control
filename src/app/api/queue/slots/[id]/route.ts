import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsPostingSlots, getDb } from '@/db';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/** Remove a posting slot (admin only). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  const { id } = await params;

  const deleted = await getDb()
    .delete(adsPostingSlots)
    .where(eq(adsPostingSlots.id, id))
    .returning({ id: adsPostingSlots.id });
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'queue_slot_removed', 'ads_posting_slot', id, {});
  return NextResponse.json({ ok: true });
}
