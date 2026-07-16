import { asc, desc, gte } from 'drizzle-orm';
import { adsCompetitors, adsListeningMentions, getDb } from '@/db';

export interface SovBrand {
  id: string;
  name: string;
  terms: string[];
  isOwn: boolean;
  mentions: number;
  sharePct: number;
}

export interface SovResult {
  days: number;
  totalMentions: number;
  brands: SovBrand[];
  ownSharePct: number;
}

export async function listCompetitors(): Promise<(typeof adsCompetitors.$inferSelect)[]> {
  return getDb().select().from(adsCompetitors).orderBy(desc(adsCompetitors.isOwn), asc(adsCompetitors.name));
}

/**
 * Share-of-voice from listening mentions in the window: a mention counts for a brand when its
 * content contains any of that brand's terms (case-insensitive). A mention can count for more than
 * one brand; share is each brand's count over the summed total.
 */
export async function computeShareOfVoice(days = 30): Promise<SovResult> {
  const db = getDb();
  const window = Math.min(365, Math.max(1, days));
  const since = new Date(Date.now() - window * 86400000);

  const brands = await db.select().from(adsCompetitors);
  const mentions = await db
    .select({ content: adsListeningMentions.content })
    .from(adsListeningMentions)
    .where(gte(adsListeningMentions.createdAt, since))
    .limit(10000);
  const lowered = mentions.map((m) => m.content.toLowerCase());

  const counts = brands.map((b) => {
    const terms = (b.terms ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);
    const mentionsCount = terms.length ? lowered.filter((c) => terms.some((t) => c.includes(t))).length : 0;
    return { id: b.id, name: b.name, terms: b.terms ?? [], isOwn: b.isOwn, mentions: mentionsCount };
  });
  const total = counts.reduce((s, r) => s + r.mentions, 0);
  const withShare: SovBrand[] = counts
    .map((r) => ({ ...r, sharePct: total ? Math.round((r.mentions / total) * 100) : 0 }))
    .sort((a, b) => b.mentions - a.mentions);
  const ownSharePct = withShare.filter((r) => r.isOwn).reduce((s, r) => s + r.sharePct, 0);

  return { days: window, totalMentions: total, brands: withShare, ownSharePct };
}
