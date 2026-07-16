import type { adsSocialAccounts } from '@/db';

type Account = typeof adsSocialAccounts.$inferSelect;

export interface AdapterCapabilities {
  /** API publishing is wired up (see publisher.ts). */
  publish: boolean;
  /** Engagement/metrics snapshots are pulled (see metrics.ts). */
  metrics: boolean;
  /** Audience comments can be pulled into the inbox (pull-based ingestion). */
  comments: boolean;
}

export interface RawComment {
  threadExternalId: string;
  externalId: string;
  authorName?: string;
  authorHandle?: string;
  permalink?: string;
  body: string;
  at?: string;
}

export interface NetworkAdapter {
  platform: string;
  label: string;
  capabilities: AdapterCapabilities;
  /** Pull recent audience comments to feed the inbox — complements the push webhook. */
  fetchComments?: (account: Account) => Promise<RawComment[]>;
}

/**
 * Provider-agnostic comment puller. POST/GET a stubbable endpoint (REHABSYNC_INGEST_URL) that returns
 * `{comments:[…]}` (or a bare array) for the given account. Unset ⇒ no-op (empty), so ingestion is
 * simply dormant until a real provider is wired up. Never throws.
 */
async function fetchCommentsViaProvider(account: Account): Promise<RawComment[]> {
  const base = process.env['REHABSYNC_INGEST_URL'];
  if (!base) return [];
  try {
    const url = `${base.replace(/\/+$/, '')}?platform=${encodeURIComponent(account.platform)}&account=${encodeURIComponent(account.externalId)}`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = (await res.json().catch(() => null)) as { comments?: RawComment[] } | RawComment[] | null;
    const list = Array.isArray(data) ? data : (data?.comments ?? []);
    return list.filter((c): c is RawComment => Boolean(c && c.threadExternalId && c.externalId && c.body));
  } catch {
    return [];
  }
}

function adapter(
  platform: string,
  label: string,
  caps: AdapterCapabilities,
): NetworkAdapter {
  return { platform, label, capabilities: caps, ...(caps.comments ? { fetchComments: fetchCommentsViaProvider } : {}) };
}

/** The network capability matrix. Publish/metrics reflect what publisher.ts / metrics.ts support today. */
export const ADAPTERS: Record<string, NetworkAdapter> = {
  facebook: adapter('facebook', 'Facebook', { publish: true, metrics: true, comments: true }),
  instagram: adapter('instagram', 'Instagram', { publish: true, metrics: true, comments: true }),
  linkedin: adapter('linkedin', 'LinkedIn', { publish: true, metrics: false, comments: true }),
  youtube: adapter('youtube', 'YouTube', { publish: true, metrics: false, comments: true }),
  tiktok: adapter('tiktok', 'TikTok', { publish: true, metrics: false, comments: false }),
  x: adapter('x', 'X', { publish: false, metrics: false, comments: true }),
  threads: adapter('threads', 'Threads', { publish: false, metrics: false, comments: false }),
};

export function adapterFor(platform: string): NetworkAdapter | null {
  return ADAPTERS[platform] ?? null;
}

export function listAdapters(): NetworkAdapter[] {
  return Object.values(ADAPTERS);
}
