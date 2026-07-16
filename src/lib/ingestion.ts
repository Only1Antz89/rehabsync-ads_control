import { eq } from 'drizzle-orm';
import { adsInboxMessages, adsSocialAccounts, getDb } from '@/db';
import { ingestInbound, normalizeInbound } from './inbox';
import { adapterFor } from './social/adapters';

/**
 * Pull audience comments from every connected account whose adapter supports it, and thread them
 * into the inbox. Idempotent: a comment already stored (matched on its provider message id) is
 * skipped, so re-running never duplicates. Tolerant — one account failing never aborts the run.
 */
export async function syncIngestion(): Promise<Record<string, unknown>> {
  const db = getDb();
  const accounts = await db
    .select()
    .from(adsSocialAccounts)
    .where(eq(adsSocialAccounts.status, 'connected'));

  let scanned = 0;
  let ingested = 0;
  let skipped = 0;

  for (const account of accounts) {
    const adapter = adapterFor(account.platform);
    if (!adapter?.capabilities.comments || !adapter.fetchComments) continue;

    const comments = await adapter.fetchComments(account).catch(() => []);
    for (const comment of comments) {
      scanned += 1;
      const [existing] = await db
        .select({ id: adsInboxMessages.id })
        .from(adsInboxMessages)
        .where(eq(adsInboxMessages.externalId, comment.externalId))
        .limit(1);
      if (existing) {
        skipped += 1;
        continue;
      }
      const normalized = normalizeInbound({
        platform: account.platform,
        threadExternalId: comment.threadExternalId,
        kind: 'comment',
        accountExternalId: account.externalId,
        authorName: comment.authorName,
        authorHandle: comment.authorHandle,
        permalink: comment.permalink,
        message: {
          externalId: comment.externalId,
          authorName: comment.authorName,
          body: comment.body,
          at: comment.at,
        },
      });
      if ('error' in normalized) {
        skipped += 1;
        continue;
      }
      await ingestInbound(normalized);
      ingested += 1;
    }
  }

  return { ok: true, accounts: accounts.length, scanned, ingested, skipped };
}
