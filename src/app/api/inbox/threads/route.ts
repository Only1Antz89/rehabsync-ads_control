import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { adsInboxThreads, getDb, INBOX_STATUSES } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

/** Triage list of inbox threads, newest activity first, with open/unread counts for the badges. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get('status')?.trim();
  const platform = url.searchParams.get('platform')?.trim();
  const assigned = url.searchParams.get('assigned')?.trim();
  const unread = url.searchParams.get('unread');
  const q = url.searchParams.get('q')?.trim();

  const conds: SQL[] = [];
  if (status && (INBOX_STATUSES as readonly string[]).includes(status)) conds.push(eq(adsInboxThreads.status, status));
  if (platform) conds.push(eq(adsInboxThreads.platform, platform));
  if (assigned === 'me') conds.push(eq(adsInboxThreads.assignedTo, session.email));
  else if (assigned === 'unassigned') conds.push(isNull(adsInboxThreads.assignedTo));
  else if (assigned) conds.push(eq(adsInboxThreads.assignedTo, assigned));
  if (unread === '1') conds.push(eq(adsInboxThreads.unread, true));
  if (q) {
    const like = `%${q}%`;
    const search = or(ilike(adsInboxThreads.authorName, like), ilike(adsInboxThreads.snippet, like));
    if (search) conds.push(search);
  }

  const db = getDb();
  const [threads, [counts]] = await Promise.all([
    db
      .select()
      .from(adsInboxThreads)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(adsInboxThreads.lastMessageAt))
      .limit(200),
    db
      .select({
        open: sql<number>`count(*) filter (where ${adsInboxThreads.status} = 'open')::int`,
        unread: sql<number>`count(*) filter (where ${adsInboxThreads.unread})::int`,
      })
      .from(adsInboxThreads),
  ]);

  return NextResponse.json({ threads, counts: counts ?? { open: 0, unread: 0 } });
}
