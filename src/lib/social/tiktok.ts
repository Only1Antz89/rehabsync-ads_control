/**
 * TikTok (Content Posting API) — video publishing via PULL_FROM_URL, so the platform fetches the
 * video from our hosted URL and no chunked upload is needed. Endpoints are env-overridable
 * (REHABSYNC_TIKTOK_OAUTH_URL / REHABSYNC_TIKTOK_API_URL) for stub-based E2E; the Content Posting
 * API audit is an external prerequisite — until credentials are set, TikTok stays manual-export.
 */
import { and, eq } from 'drizzle-orm';
import { adsSocialAccounts, getDb } from '@/db';
import { decryptToken, encryptToken } from '@/lib/crypto';

function oauthBase(): string {
  return (process.env['REHABSYNC_TIKTOK_OAUTH_URL'] ?? 'https://www.tiktok.com').replace(/\/+$/, '');
}

function apiBase(): string {
  return (process.env['REHABSYNC_TIKTOK_API_URL'] ?? 'https://open.tiktokapis.com').replace(/\/+$/, '');
}

function clientKey(): string {
  const key = process.env['TIKTOK_CLIENT_KEY'];
  if (!key) throw new Error('TIKTOK_CLIENT_KEY is not set');
  return key;
}

function clientSecret(): string {
  const secret = process.env['TIKTOK_CLIENT_SECRET'];
  if (!secret) throw new Error('TIKTOK_CLIENT_SECRET is not set');
  return secret;
}

export function tiktokConfigured(): boolean {
  return Boolean(process.env['TIKTOK_CLIENT_KEY'] && process.env['TIKTOK_CLIENT_SECRET']);
}

export function tiktokAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_key: clientKey(),
    response_type: 'code',
    scope: 'user.info.basic,video.publish',
    redirect_uri: redirectUri,
    state,
  });
  return `${oauthBase()}/v2/auth/authorize/?${params}`;
}

export interface TikTokTokens {
  accessToken: string;
  expiresInSecs: number;
  refreshToken: string | null;
  openId: string | null;
}

async function tokenRequest(params: Record<string, string>): Promise<TikTokTokens> {
  const res = await fetch(`${apiBase()}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    open_id?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !data?.access_token) {
    throw new Error(`TikTok token: ${data?.error_description ?? `HTTP ${res.status}`}`);
  }
  return {
    accessToken: data.access_token,
    expiresInSecs: data.expires_in ?? 86400,
    refreshToken: data.refresh_token ?? null,
    openId: data.open_id ?? null,
  };
}

export function exchangeTikTokCode(code: string, redirectUri: string): Promise<TikTokTokens> {
  return tokenRequest({
    client_key: clientKey(),
    client_secret: clientSecret(),
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
}

export interface DiscoveredTikTok {
  platform: 'tiktok';
  externalId: string;
  displayName: string;
  avatarUrl: string | null;
  meta: Record<string, unknown>;
}

export async function discoverTikTokUser(accessToken: string, openId: string | null): Promise<DiscoveredTikTok> {
  const res = await fetch(`${apiBase()}/v2/user/info/?fields=open_id,display_name,avatar_url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => null)) as {
    data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } };
    error?: { code?: string; message?: string };
  } | null;
  const user = data?.data?.user;
  const externalId = user?.open_id ?? openId;
  if (!res.ok || !externalId || (data?.error?.code && data.error.code !== 'ok')) {
    throw new Error(`TikTok user info: ${data?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return {
    platform: 'tiktok',
    externalId,
    displayName: user?.display_name ?? 'TikTok account',
    avatarUrl: user?.avatar_url ?? null,
    meta: { openId: externalId },
  };
}

// ── Publishing ────────────────────────────────────────────────────────────────

type Account = typeof adsSocialAccounts.$inferSelect;

async function ensureToken(account: Account): Promise<string> {
  if (!account.accessTokenEnc) throw new Error('Account has no stored token — reconnect it');
  const expired = account.tokenExpiresAt !== null && account.tokenExpiresAt.getTime() < Date.now() + 60000;
  if (!expired) return decryptToken(account.accessTokenEnc);

  if (!account.refreshTokenEnc) throw new Error('TikTok token expired — reconnect the account');
  const refreshed = await tokenRequest({
    client_key: clientKey(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token',
    refresh_token: decryptToken(account.refreshTokenEnc),
  });
  await getDb()
    .update(adsSocialAccounts)
    .set({
      accessTokenEnc: encryptToken(refreshed.accessToken),
      refreshTokenEnc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : account.refreshTokenEnc,
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresInSecs * 1000),
      updatedAt: new Date(),
    })
    .where(and(eq(adsSocialAccounts.id, account.id), eq(adsSocialAccounts.platform, 'tiktok')));
  return refreshed.accessToken;
}

export interface PublishInput {
  body: string;
  title?: string | null;
  videoUrl?: string | null;
}

export interface PublishResult {
  platformPostId: string;
  platformUrl: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Publish a video via PULL_FROM_URL, then poll briefly so immediate failures surface as errors. */
export async function publishToTikTok(account: Account, input: PublishInput): Promise<PublishResult> {
  if (!input.videoUrl?.trim()) throw new Error('TikTok requires a video URL');
  const accessToken = await ensureToken(account);

  const init = await fetch(`${apiBase()}/v2/post/publish/video/init/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      post_info: {
        title: (input.title?.trim() || input.body).slice(0, 2200),
        privacy_level: 'PUBLIC_TO_EVERYONE',
      },
      source_info: { source: 'PULL_FROM_URL', video_url: input.videoUrl.trim() },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  const initData = (await init.json().catch(() => null)) as {
    data?: { publish_id?: string };
    error?: { code?: string; message?: string };
  } | null;
  const publishId = initData?.data?.publish_id;
  if (!init.ok || !publishId || (initData?.error?.code && initData.error.code !== 'ok')) {
    throw new Error(`TikTok publish init: ${initData?.error?.message ?? `HTTP ${init.status}`}`);
  }

  // TikTok downloads + processes async; poll a few times to catch immediate failures.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sleep(1500);
    const statusRes = await fetch(`${apiBase()}/v2/post/publish/status/fetch/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish_id: publishId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const statusData = (await statusRes.json().catch(() => null)) as {
      data?: { status?: string; fail_reason?: string };
    } | null;
    const status = statusData?.data?.status;
    if (status === 'FAILED') {
      throw new Error(`TikTok publish failed: ${statusData?.data?.fail_reason ?? 'unknown reason'}`);
    }
    if (status === 'PUBLISH_COMPLETE') break;
    // PROCESSING_* — keep the publish_id and let it finish server-side.
  }

  return { platformPostId: publishId, platformUrl: null };
}
