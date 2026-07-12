import { asc, eq } from 'drizzle-orm';
import { adsPostingSlots, adsPosts, getDb } from '@/db';

export interface Slot {
  id: string;
  weekday: number; // 0=Sunday … 6=Saturday (UTC)
  minutes: number; // minutes since midnight (UTC)
}

export async function listSlots(): Promise<Slot[]> {
  const rows = await getDb()
    .select()
    .from(adsPostingSlots)
    .orderBy(asc(adsPostingSlots.weekday), asc(adsPostingSlots.minutes));
  return rows.map((r) => ({ id: r.id, weekday: r.weekday, minutes: r.minutes }));
}

/**
 * The next posting-slot datetime strictly after `after` that isn't already taken by another
 * scheduled post. Returns null when no slots are configured (or the 3-week horizon is full).
 * Slots are interpreted in UTC.
 */
export async function nextQueueSlot(after: Date = new Date()): Promise<Date | null> {
  const db = getDb();
  const slots = await db
    .select({ weekday: adsPostingSlots.weekday, minutes: adsPostingSlots.minutes })
    .from(adsPostingSlots);
  if (slots.length === 0) return null;

  const scheduled = await db
    .select({ at: adsPosts.scheduledAt })
    .from(adsPosts)
    .where(eq(adsPosts.status, 'scheduled'));
  const taken = new Set(
    scheduled.map((s) => s.at?.getTime()).filter((n): n is number => typeof n === 'number'),
  );

  const nowMs = after.getTime();
  const base = Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate());
  for (let d = 0; d < 21; d += 1) {
    const dayMs = base + d * 86400000;
    const weekday = new Date(dayMs).getUTCDay();
    const daySlots = slots
      .filter((s) => s.weekday === weekday)
      .map((s) => s.minutes)
      .sort((a, b) => a - b);
    for (const m of daySlots) {
      const ms = dayMs + m * 60000;
      if (ms > nowMs && !taken.has(ms)) return new Date(ms);
    }
  }
  return null;
}
