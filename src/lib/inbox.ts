import { and, eq, sql } from 'drizzle-orm';
import {
  adsInboxMessages,
  adsInboxThreads,
  adsSocialAccounts,
  getDb,
  INBOX_THREAD_KINDS,
} from '@/db';
import type { InboxThreadKind } from '@/db';

const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface NormalizedInbound {
  platform: string;
  threadExternalId: string;
  kind?: string;
  accountExternalId?: string;
  authorName?: string;
  authorHandle?: string;
  permalink?: string;
  message: {
    externalId?: string;
    authorName?: string;
    body: string;
    at?: string;
  };
}

/** Validate + coerce an incoming webhook payload. Returns an error string on a bad shape. */
export function normalizeInbound(input: unknown): NormalizedInbound | { error: string } {
  const p = (input ?? {}) as Record<string, unknown>;
  const platform = String(p['platform'] ?? '').toLowerCase();
  if (!(PLATFORMS as readonly string[]).includes(platform)) return { error: 'Unknown or missing platform.' };
  const threadExternalId = String(p['threadExternalId'] ?? p['externalId'] ?? '').trim();
  if (!threadExternalId) return { error: 'threadExternalId is required.' };
  const msg = (p['message'] ?? {}) as Record<string, unknown>;
  const body = String(msg['body'] ?? '').trim();
  if (!body) return { error: 'message.body is required.' };
  const kind = (INBOX_THREAD_KINDS as readonly string[]).includes(String(p['kind'])) ? String(p['kind']) : 'comment';

  return {
    platform,
    threadExternalId: threadExternalId.slice(0, 200),
    kind,
    accountExternalId: p['accountExternalId'] ? String(p['accountExternalId']) : undefined,
    authorName: p['authorName'] ? String(p['authorName']).slice(0, 200) : undefined,
    authorHandle: p['authorHandle'] ? String(p['authorHandle']).slice(0, 200) : undefined,
    permalink: p['permalink'] ? String(p['permalink']).slice(0, 600) : undefined,
    message: {
      externalId: msg['externalId'] ? String(msg['externalId']).slice(0, 200) : undefined,
      authorName: msg['authorName'] ? String(msg['authorName']).slice(0, 200) : undefined,
      body: body.slice(0, 8000),
      at: msg['at'] ? String(msg['at']) : undefined,
    },
  };
}

/** Upsert a thread from an inbound event and append the message. Reopens closed threads. */
export async function ingestInbound(evt: NormalizedInbound): Promise<{ threadId: string; created: boolean }> {
  const db = getDb();

  let accountId: string | null = null;
  if (evt.accountExternalId) {
    const [account] = await db
      .select({ id: adsSocialAccounts.id })
      .from(adsSocialAccounts)
      .where(and(eq(adsSocialAccounts.platform, evt.platform), eq(adsSocialAccounts.externalId, evt.accountExternalId)))
      .limit(1);
    accountId = account?.id ?? null;
  }

  const at = evt.message.at ? new Date(evt.message.at) : new Date();
  const messageAt = Number.isNaN(at.getTime()) ? new Date() : at;

  const [existing] = await db
    .select({ id: adsInboxThreads.id })
    .from(adsInboxThreads)
    .where(and(eq(adsInboxThreads.platform, evt.platform), eq(adsInboxThreads.externalId, evt.threadExternalId)))
    .limit(1);

  let threadId: string;
  let created = false;
  if (existing) {
    threadId = existing.id;
    await db
      .update(adsInboxThreads)
      .set({
        // A new inbound message reopens a closed thread and flags it unread.
        status: sql`case when ${adsInboxThreads.status} = 'closed' then 'open' else ${adsInboxThreads.status} end`,
        unread: true,
        snippet: evt.message.body.slice(0, 280),
        lastMessageAt: messageAt,
        updatedAt: new Date(),
      })
      .where(eq(adsInboxThreads.id, threadId));
  } else {
    const [row] = await db
      .insert(adsInboxThreads)
      .values({
        accountId,
        platform: evt.platform,
        externalId: evt.threadExternalId,
        kind: evt.kind as InboxThreadKind,
        authorName: evt.authorName ?? evt.message.authorName ?? null,
        authorHandle: evt.authorHandle ?? null,
        permalink: evt.permalink ?? null,
        snippet: evt.message.body.slice(0, 280),
        status: 'open',
        unread: true,
        lastMessageAt: messageAt,
      })
      .returning({ id: adsInboxThreads.id });
    threadId = row!.id;
    created = true;
  }

  await db.insert(adsInboxMessages).values({
    threadId,
    direction: 'in',
    externalId: evt.message.externalId ?? null,
    authorName: evt.message.authorName ?? evt.authorName ?? null,
    body: evt.message.body,
    status: 'received',
    createdAt: messageAt,
  });

  return { threadId, created };
}

/**
 * Deliver an outbound reply to the network. Real per-network sending is wired behind
 * REHABSYNC_INBOX_SEND_URL (an env-overridable gateway, matching the app's other integrations);
 * when it isn't configured the reply is captured and left `queued` for delivery once the channel's
 * write scope is connected.
 */
export async function deliverReply(
  thread: { platform: string; externalId: string; accountId: string | null },
  text: string,
): Promise<{ delivered: boolean; externalId?: string; error?: string }> {
  const sendUrl = process.env['REHABSYNC_INBOX_SEND_URL'];
  if (!sendUrl) return { delivered: false };
  try {
    const res = await fetch(sendUrl.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: thread.platform, threadExternalId: thread.externalId, text }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => null)) as { externalId?: string; error?: string } | null;
    if (!res.ok) return { delivered: false, error: data?.error ?? `HTTP ${res.status}` };
    return { delivered: true, externalId: data?.externalId };
  } catch (err) {
    return { delivered: false, error: (err as Error).message };
  }
}
