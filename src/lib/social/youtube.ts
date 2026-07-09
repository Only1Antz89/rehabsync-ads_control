/**
 * YouTube (Data API v3) — video upload via Google OAuth + the resumable upload protocol: initiate
 * the session, then PUT the bytes fetched from our hosted video URL. Endpoints are env-overridable
 * (REHABSYNC_GOOGLE_OAUTH_URL / REHABSYNC_GOOGLE_TOKEN_URL / REHABSYNC_YOUTUBE_API_URL) for
 * stub-based E2E. Production quota needs Google OAuth verification — until credentials are set,
 * YouTube stays manual-export.
 */
import { and, eq } from 'drizzle-orm';
import { adsSocialAccounts, getDb } from '@/db';
import { decryptToken, encryptToken } from '@/lib/crypto';

// Keep pulled videos bounded — Vercel functions can't stream multi-GB uploads.
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

function oauthBase(): string {
  return (process.env['REHABSYNC_GOOGLE_OAUTH_URL'] ?? 'https://accounts.google.com').replace(/\/+$/, '');
}

function tokenBase(): string {
  return (process.env['REHABSYNC_GOOGLE_TOKEN_URL'] ?? 'https://oauth2.googleapis.com').replace(/\/+$/, '');
}

function apiBase(): string {
  return (process.env['REHABSYNC_YOUTUBE_API_URL'] ?? 'https://www.googleapis.com').replace(/\/+$/, '');
}

function clientId(): string {
  const id = process.env['GOOGLE_CLIENT_ID'];
  if (!id) throw new Error('GOOGLE_CLIENT_ID is not set');
  return id;
}

function clientSecret(): string {
  const secret = process.env['GOOGLE_CLIENT_SECRET'];
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET is not set');
  return secret;
}

export function youtubeConfigured(): boolean {
  return Boolean(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']);
}

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

export function youtubeAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline', // we need a refresh token — access tokens last ~1h
    prompt: 'consent',
    state,
  });
  return `${oauthBase()}/o/oauth2/v2/auth?${params}`;
}

export interface GoogleTokens {
  accessToken: string;
  expiresInSecs: number;
  refreshToken: string | null;
}

async function tokenRequest(params: Record<string, string>): Promise<GoogleTokens> {
  const res = await fetch(`${tokenBase()}/token`, {
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
    error_description?: string;
  } | null;
  if (!res.ok || !data?.access_token) {
    throw new Error(`Google token: ${data?.error_description ?? `HTTP ${res.status}`}`);
  }
  return {
    accessToken: data.access_token,
    expiresInSecs: data.expires_in ?? 3600,
    refreshToken: data.refresh_token ?? null,
  };
}

export function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleTokens> {
  return tokenRequest({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
}

export interface DiscoveredChannel {
  platform: 'youtube';
  externalId: string;
  displayName: string;
  avatarUrl: string | null;
  meta: Record<string, unknown>;
}

export async function discoverChannels(accessToken: string): Promise<DiscoveredChannel[]> {
  const res = await fetch(`${apiBase()}/youtube/v3/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => null)) as {
    items?: Array<{
      id?: string;
      snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
    }>;
    error?: { message?: string };
  } | null;
  if (!res.ok || !data) throw new Error(`YouTube channels: ${data?.error?.message ?? `HTTP ${res.status}`}`);
  return (data.items ?? [])
    .filter((item): item is { id: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string } } } } =>
      Boolean(item.id),
    )
    .map((item) => ({
      platform: 'youtube' as const,
      externalId: item.id,
      displayName: item.snippet?.title ?? 'YouTube channel',
      avatarUrl: item.snippet?.thumbnails?.default?.url ?? null,
      meta: { channelId: item.id },
    }));
}

// ── Publishing ────────────────────────────────────────────────────────────────

type Account = typeof adsSocialAccounts.$inferSelect;

async function ensureToken(account: Account): Promise<string> {
  if (!account.accessTokenEnc) throw new Error('Account has no stored token — reconnect it');
  const expired = account.tokenExpiresAt !== null && account.tokenExpiresAt.getTime() < Date.now() + 60000;
  if (!expired) return decryptToken(account.accessTokenEnc);

  if (!account.refreshTokenEnc) throw new Error('YouTube token expired — reconnect the account');
  const refreshed = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: decryptToken(account.refreshTokenEnc),
    client_id: clientId(),
    client_secret: clientSecret(),
  });
  await getDb()
    .update(adsSocialAccounts)
    .set({
      accessTokenEnc: encryptToken(refreshed.accessToken),
      refreshTokenEnc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : account.refreshTokenEnc,
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresInSecs * 1000),
      updatedAt: new Date(),
    })
    .where(and(eq(adsSocialAccounts.id, account.id), eq(adsSocialAccounts.platform, 'youtube')));
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

/** Resumable upload: initiate the session, fetch the source video, PUT the bytes. */
export async function publishToYouTube(account: Account, input: PublishInput): Promise<PublishResult> {
  if (!input.videoUrl?.trim()) throw new Error('YouTube requires a video URL');
  const title = input.title?.trim();
  if (!title) throw new Error('YouTube requires a title');
  const accessToken = await ensureToken(account);

  const init = await fetch(
    `${apiBase()}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: { title: title.slice(0, 100), description: input.body.slice(0, 5000) },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!init.ok) {
    const data = (await init.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`YouTube upload init: ${data?.error?.message ?? `HTTP ${init.status}`}`);
  }
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube upload init: response missing Location header');

  const source = await fetch(input.videoUrl.trim(), { cache: 'no-store', signal: AbortSignal.timeout(120000) });
  if (!source.ok) throw new Error(`YouTube video fetch: source returned HTTP ${source.status}`);
  const declared = Number(source.headers.get('content-length') ?? 0);
  if (declared > MAX_VIDEO_BYTES) throw new Error('Video is too large to relay (200 MB limit)');
  const bytes = await source.arrayBuffer();
  if (bytes.byteLength > MAX_VIDEO_BYTES) throw new Error('Video is too large to relay (200 MB limit)');

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'video/*' },
    body: bytes,
    cache: 'no-store',
    signal: AbortSignal.timeout(300000),
  });
  const uploaded = (await upload.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string };
  } | null;
  if (!upload.ok || !uploaded?.id) {
    throw new Error(`YouTube upload: ${uploaded?.error?.message ?? `HTTP ${upload.status}`}`);
  }
  return { platformPostId: uploaded.id, platformUrl: `https://www.youtube.com/watch?v=${uploaded.id}` };
}
