import { NextResponse } from 'next/server';
import { adsCompetitors, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { listCompetitors } from '@/lib/share-of-voice';

export const dynamic = 'force-dynamic';

/** List tracked brands (own + competitors). */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  return NextResponse.json({ competitors: await listCompetitors() });
}

/** Add a brand to track. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { name?: string; terms?: unknown; isOwn?: unknown } | null;
  const name = body?.name?.trim();
  const terms = Array.isArray(body?.terms)
    ? [...new Set(body!.terms.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean))].slice(0, 40)
    : [];
  if (!name) return NextResponse.json({ error: 'A brand name is required.' }, { status: 400 });
  if (terms.length === 0) return NextResponse.json({ error: 'Add at least one term to match.' }, { status: 400 });

  const [competitor] = await getDb()
    .insert(adsCompetitors)
    .values({ name: name.slice(0, 160), terms, isOwn: body?.isOwn === true, createdBy: session.email })
    .returning();
  await recordAudit(session, 'competitor_added', 'ads_competitor', competitor!.id, { isOwn: competitor!.isOwn });
  return NextResponse.json({ competitor }, { status: 201 });
}
