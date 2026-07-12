import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsListeningQueries, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { isEngagePlatform } from '@/lib/engage-platforms';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    terms?: unknown;
    platforms?: unknown;
    active?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const updates: Partial<typeof adsListeningQueries.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 160);
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (Array.isArray(body.terms)) {
    updates.terms = [...new Set(body.terms.map((t) => String(t).trim()).filter(Boolean))].slice(0, 50);
  }
  if (Array.isArray(body.platforms)) {
    updates.platforms = [...new Set(body.platforms.map((p) => String(p)).filter(isEngagePlatform))].slice(0, 20);
  }

  const [updated] = await getDb().update(adsListeningQueries).set(updates).where(eq(adsListeningQueries.id, id)).returning({ id: adsListeningQueries.id });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'listening_query_updated', 'ads_listening_query', id, {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const deleted = await getDb().delete(adsListeningQueries).where(eq(adsListeningQueries.id, id)).returning({ name: adsListeningQueries.name });
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'listening_query_deleted', 'ads_listening_query', id, { name: deleted[0]?.name });
  return NextResponse.json({ ok: true });
}
