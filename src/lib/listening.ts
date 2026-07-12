import { and, eq } from 'drizzle-orm';
import { adsListeningMentions, adsListeningQueries, getDb } from '@/db';
import { isEngagePlatform } from './engage-platforms';

const POSITIVE = [
  'love', 'great', 'amazing', 'thank', 'awesome', 'helpful', 'excellent', 'best', 'recommend',
  'brilliant', 'fantastic', 'wonderful', 'perfect', 'incredible', '👍', '❤', '💙', '😍', '🙌',
];
const NEGATIVE = [
  'hate', 'terrible', 'awful', 'worst', 'disappointed', 'useless', 'broken', 'scam', 'refund',
  'angry', 'poor', 'rubbish', 'frustrat', 'awful', 'disappointing', '😡', '👎', '🤬',
];

/** Lightweight local sentiment (no external calls). Good enough to triage a mention feed. */
export function naiveSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const t = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE) if (t.includes(w)) pos += 1;
  for (const w of NEGATIVE) if (t.includes(w)) neg += 1;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

export interface NormalizedMention {
  platform: string;
  externalId: string;
  content: string;
  authorName?: string;
  authorHandle?: string;
  permalink?: string;
  matchedTerm?: string;
  sentiment?: string;
  occurredAt?: string;
}

export function normalizeMention(input: unknown): NormalizedMention | { error: string } {
  const p = (input ?? {}) as Record<string, unknown>;
  const platform = String(p['platform'] ?? '').toLowerCase();
  if (!isEngagePlatform(platform)) return { error: 'Unknown or missing platform.' };
  const externalId = String(p['externalId'] ?? '').trim();
  if (!externalId) return { error: 'externalId is required.' };
  const content = String(p['content'] ?? '').trim();
  if (!content) return { error: 'content is required.' };
  return {
    platform,
    externalId: externalId.slice(0, 200),
    content: content.slice(0, 8000),
    authorName: p['authorName'] ? String(p['authorName']).slice(0, 200) : undefined,
    authorHandle: p['authorHandle'] ? String(p['authorHandle']).slice(0, 200) : undefined,
    permalink: p['permalink'] ? String(p['permalink']).slice(0, 600) : undefined,
    matchedTerm: p['matchedTerm'] ? String(p['matchedTerm']).slice(0, 160) : undefined,
    sentiment: typeof p['sentiment'] === 'string' ? String(p['sentiment']) : undefined,
    occurredAt: p['occurredAt'] ? String(p['occurredAt']) : undefined,
  };
}

/** First active stream whose term appears in the content (and whose platform filter allows it). */
async function matchStream(platform: string, content: string): Promise<{ queryId: string; term: string } | null> {
  const queries = await getDb().select().from(adsListeningQueries).where(eq(adsListeningQueries.active, true));
  const lc = content.toLowerCase();
  for (const q of queries) {
    const platforms = q.platforms ?? [];
    if (platforms.length && !platforms.includes(platform)) continue;
    for (const term of q.terms ?? []) {
      const t = term.trim().toLowerCase();
      if (t && lc.includes(t)) return { queryId: q.id, term };
    }
  }
  return null;
}

/** Ingest a public mention: attach a matching stream, score sentiment, dedupe by (platform, externalId). */
export async function ingestMention(evt: NormalizedMention): Promise<{ id: string; created: boolean; queryId: string | null }> {
  const db = getDb();
  const match = await matchStream(evt.platform, evt.content);
  const queryId = match?.queryId ?? null;
  const matchedTerm = evt.matchedTerm ?? match?.term ?? null;
  const sentiment =
    evt.sentiment && ['positive', 'neutral', 'negative'].includes(evt.sentiment)
      ? evt.sentiment
      : naiveSentiment(evt.content);
  const at = evt.occurredAt ? new Date(evt.occurredAt) : new Date();
  const createdAt = Number.isNaN(at.getTime()) ? new Date() : at;

  const [existing] = await db
    .select({ id: adsListeningMentions.id })
    .from(adsListeningMentions)
    .where(and(eq(adsListeningMentions.platform, evt.platform), eq(adsListeningMentions.externalId, evt.externalId)))
    .limit(1);
  if (existing) return { id: existing.id, created: false, queryId };

  const [row] = await db
    .insert(adsListeningMentions)
    .values({
      queryId,
      platform: evt.platform,
      externalId: evt.externalId,
      authorName: evt.authorName ?? null,
      authorHandle: evt.authorHandle ?? null,
      permalink: evt.permalink ?? null,
      content: evt.content,
      sentiment,
      matchedTerm,
      status: 'new',
      createdAt,
    })
    .returning({ id: adsListeningMentions.id });
  return { id: row!.id, created: true, queryId };
}
