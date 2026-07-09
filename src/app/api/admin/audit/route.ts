import { NextResponse } from 'next/server';
import { desc, ilike, or } from 'drizzle-orm';
import { adsAuditLogs, getDb } from '@/db';
import { isResponse, requireAdmin } from '@/lib/route-auth';

const PAGE_SIZE = 50;

/** Paginated audit trail (admin). ?q= matches actor, action or entity type; ?offset= pages. */
export async function GET(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);

  const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
  const db = getDb();
  const rows = await db
    .select()
    .from(adsAuditLogs)
    .where(
      q
        ? or(
            ilike(adsAuditLogs.actorEmail, like),
            ilike(adsAuditLogs.action, like),
            ilike(adsAuditLogs.entityType, like),
          )
        : undefined,
    )
    .orderBy(desc(adsAuditLogs.createdAt))
    .offset(offset)
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  return NextResponse.json({ entries: rows.slice(0, PAGE_SIZE), hasMore });
}
