import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { adsPostingSlots, getDb } from '@/db';
import { isResponse, requireAdmin, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { listSlots, nextQueueSlot } from '@/lib/queue';

export const dynamic = 'force-dynamic';

/** List posting slots + the next resolvable slot (for the composer preview). Any session. */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const [slots, next] = await Promise.all([listSlots(), nextQueueSlot()]);
  return NextResponse.json({ slots, next: next?.toISOString() ?? null });
}

/** Add a posting slot (admin only). */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { weekday?: number; minutes?: number } | null;
  const weekday = Number(body?.weekday);
  const minutes = Number(body?.minutes);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: 'weekday must be 0–6.' }, { status: 400 });
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    return NextResponse.json({ error: 'minutes must be 0–1439.' }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: adsPostingSlots.id })
    .from(adsPostingSlots)
    .where(and(eq(adsPostingSlots.weekday, weekday), eq(adsPostingSlots.minutes, minutes)))
    .limit(1);
  if (existing) return NextResponse.json({ error: 'That slot already exists.' }, { status: 409 });

  const [created] = await db
    .insert(adsPostingSlots)
    .values({ weekday, minutes, createdBy: session.email })
    .returning({ id: adsPostingSlots.id });
  await recordAudit(session, 'queue_slot_added', 'ads_posting_slot', created?.id ?? null, { weekday, minutes });
  return NextResponse.json({ ok: true, id: created?.id }, { status: 201 });
}
