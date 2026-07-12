import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { adsInboxMessages, adsInboxThreads, getDb } from '@/db';

export interface InboxAnalytics {
  totals: { threads: number; open: number; pending: number; closed: number; spam: number; unread: number };
  byPlatform: { platform: string; count: number }[];
  byKind: { kind: string; count: number }[];
  replyRatePct: number;
  avgFirstResponseMins: number | null;
  byAssignee: { assignee: string; open: number }[];
  weekly: { day: string; inbound: number }[];
}

export async function loadInboxAnalytics(): Promise<InboxAnalytics> {
  const db = getDb();
  const since = new Date(Date.now() - 7 * 86400000);

  const [totalsRow, byPlatform, byKind, perThread, byAssignee, daily] = await Promise.all([
    db
      .select({
        threads: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${adsInboxThreads.status} = 'open')::int`,
        pending: sql<number>`count(*) filter (where ${adsInboxThreads.status} = 'pending')::int`,
        closed: sql<number>`count(*) filter (where ${adsInboxThreads.status} = 'closed')::int`,
        spam: sql<number>`count(*) filter (where ${adsInboxThreads.status} = 'spam')::int`,
        unread: sql<number>`count(*) filter (where ${adsInboxThreads.unread})::int`,
      })
      .from(adsInboxThreads),
    db
      .select({ platform: adsInboxThreads.platform, count: sql<number>`count(*)::int` })
      .from(adsInboxThreads)
      .groupBy(adsInboxThreads.platform)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ kind: adsInboxThreads.kind, count: sql<number>`count(*)::int` })
      .from(adsInboxThreads)
      .groupBy(adsInboxThreads.kind)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        threadId: adsInboxMessages.threadId,
        firstIn: sql<string | null>`min(${adsInboxMessages.createdAt}) filter (where ${adsInboxMessages.direction} = 'in')`,
        firstOut: sql<string | null>`min(${adsInboxMessages.createdAt}) filter (where ${adsInboxMessages.direction} = 'out')`,
      })
      .from(adsInboxMessages)
      .groupBy(adsInboxMessages.threadId),
    db
      .select({ assignee: adsInboxThreads.assignedTo, open: sql<number>`count(*) filter (where ${adsInboxThreads.status} = 'open')::int` })
      .from(adsInboxThreads)
      .where(isNotNull(adsInboxThreads.assignedTo))
      .groupBy(adsInboxThreads.assignedTo)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${adsInboxMessages.createdAt}), 'YYYY-MM-DD')`,
        inbound: sql<number>`count(*)::int`,
      })
      .from(adsInboxMessages)
      .where(and(eq(adsInboxMessages.direction, 'in'), gte(adsInboxMessages.createdAt, since)))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  const totals = totalsRow[0] ?? { threads: 0, open: 0, pending: 0, closed: 0, spam: 0, unread: 0 };

  // Reply rate + average first-response time from per-thread first in/out timestamps.
  let replied = 0;
  let respSum = 0;
  let respCount = 0;
  for (const t of perThread) {
    if (t.firstOut) replied += 1;
    if (t.firstIn && t.firstOut) {
      const mins = (new Date(t.firstOut).getTime() - new Date(t.firstIn).getTime()) / 60000;
      if (mins >= 0) {
        respSum += mins;
        respCount += 1;
      }
    }
  }
  const replyRatePct = totals.threads > 0 ? Math.round((replied / totals.threads) * 100) : 0;
  const avgFirstResponseMins = respCount > 0 ? Math.round(respSum / respCount) : null;

  // 7-day inbound volume, gaps filled with zero.
  const dayMap = new Map(daily.map((d) => [d.day, d.inbound]));
  const weekly: { day: string; inbound: number }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    weekly.push({ day: key, inbound: dayMap.get(key) ?? 0 });
  }

  return {
    totals,
    byPlatform,
    byKind,
    replyRatePct,
    avgFirstResponseMins,
    byAssignee: byAssignee.map((a) => ({ assignee: a.assignee ?? 'Unassigned', open: a.open })),
    weekly,
  };
}
