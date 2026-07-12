import { NextResponse } from 'next/server';
import { desc, inArray, sql } from 'drizzle-orm';
import { adsListeningMentions, adsListeningQueries, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { isEngagePlatform } from '@/lib/engage-platforms';

export const dynamic = 'force-dynamic';

/** Listening streams with mention counts. */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const db = getDb();
  const queries = await db.select().from(adsListeningQueries).orderBy(desc(adsListeningQueries.createdAt)).limit(200);
  const ids = queries.map((q) => q.id);
  const counts = ids.length
    ? await db
        .select({
          queryId: adsListeningMentions.queryId,
          total: sql<number>`count(*)::int`,
          fresh: sql<number>`count(*) filter (where ${adsListeningMentions.status} = 'new')::int`,
        })
        .from(adsListeningMentions)
        .where(inArray(adsListeningMentions.queryId, ids))
        .groupBy(adsListeningMentions.queryId)
    : [];
  const map = new Map(counts.map((c) => [c.queryId, c]));
  return NextResponse.json({
    queries: queries.map((q) => ({ ...q, mentions: map.get(q.id)?.total ?? 0, fresh: map.get(q.id)?.fresh ?? 0 })),
  });
}

/** Create a listening stream. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    terms?: unknown;
    platforms?: unknown;
  } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: 'Stream name is required.' }, { status: 400 });

  const terms = Array.isArray(body?.terms)
    ? [...new Set(body.terms.map((t) => String(t).trim()).filter(Boolean))].slice(0, 50)
    : [];
  if (terms.length === 0) return NextResponse.json({ error: 'Add at least one term to track.' }, { status: 400 });
  const platforms = Array.isArray(body?.platforms)
    ? [...new Set(body.platforms.map((p) => String(p)).filter(isEngagePlatform))].slice(0, 20)
    : [];

  const [created] = await getDb()
    .insert(adsListeningQueries)
    .values({ name: name.slice(0, 160), terms, platforms, createdBy: session.email })
    .returning({ id: adsListeningQueries.id });
  await recordAudit(session, 'listening_query_created', 'ads_listening_query', created?.id ?? null, { terms: terms.length });
  return NextResponse.json({ ok: true, id: created?.id }, { status: 201 });
}
