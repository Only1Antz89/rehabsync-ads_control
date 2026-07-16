import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsCompetitors, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

/** Stop tracking a brand. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  await getDb().delete(adsCompetitors).where(eq(adsCompetitors.id, id));
  await recordAudit(session, 'competitor_removed', 'ads_competitor', id, {});
  return NextResponse.json({ ok: true });
}
