import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { adsListeningMentions, getDb, LISTENING_MENTION_STATUSES, LISTENING_SENTIMENTS } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

/** Mentions feed with filters + a sentiment breakdown. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const queryId = url.searchParams.get('queryId')?.trim();
  const platform = url.searchParams.get('platform')?.trim();
  const sentiment = url.searchParams.get('sentiment')?.trim();
  const status = url.searchParams.get('status')?.trim();
  const q = url.searchParams.get('q')?.trim();

  const conds: SQL[] = [];
  if (queryId) conds.push(eq(adsListeningMentions.queryId, queryId));
  if (platform) conds.push(eq(adsListeningMentions.platform, platform));
  if (sentiment && (LISTENING_SENTIMENTS as readonly string[]).includes(sentiment)) {
    conds.push(eq(adsListeningMentions.sentiment, sentiment));
  }
  if (status && (LISTENING_MENTION_STATUSES as readonly string[]).includes(status)) {
    conds.push(eq(adsListeningMentions.status, status));
  }
  if (q) conds.push(ilike(adsListeningMentions.content, `%${q}%`));

  const db = getDb();
  const [mentions, [counts]] = await Promise.all([
    db
      .select()
      .from(adsListeningMentions)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(adsListeningMentions.createdAt))
      .limit(200),
    db
      .select({
        positive: sql<number>`count(*) filter (where ${adsListeningMentions.sentiment} = 'positive')::int`,
        neutral: sql<number>`count(*) filter (where ${adsListeningMentions.sentiment} = 'neutral')::int`,
        negative: sql<number>`count(*) filter (where ${adsListeningMentions.sentiment} = 'negative')::int`,
        fresh: sql<number>`count(*) filter (where ${adsListeningMentions.status} = 'new')::int`,
      })
      .from(adsListeningMentions),
  ]);

  return NextResponse.json({ mentions, counts: counts ?? { positive: 0, neutral: 0, negative: 0, fresh: 0 } });
}
