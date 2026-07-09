/**
 * Meta (Facebook Pages + Instagram Business) integration via the Graph API.
 *
 * Endpoints are env-overridable (REHABSYNC_META_GRAPH_URL / REHABSYNC_META_OAUTH_URL) so the
 * publish pipeline can be exercised end-to-end against a stub server in tests; production uses
 * the real Graph API defaults. Page access tokens are long-lived; we store them encrypted.
 */
import { decryptToken } from '@/lib/crypto';

const API_VERSION = 'v21.0';

export function graphBase(): string {
  return (process.env['REHABSYNC_META_GRAPH_URL'] ?? 'https://graph.facebook.com').replace(/\/+$/, '');
}

function oauthBase(): string {
  return (process.env['REHABSYNC_META_OAUTH_URL'] ?? 'https://www.facebook.com').replace(/\/+$/, '');
}

function appId(): string {
  const id = process.env['META_APP_ID'];
  if (!id) throw new Error('META_APP_ID is not set');
  return id;
}

function appSecret(): string {
  const secret = process.env['META_APP_SECRET'];
  if (!secret) throw new Error('META_APP_SECRET is not set');
  return secret;
}

export function metaConfigured(): boolean {
  return Boolean(process.env['META_APP_ID'] && process.env['META_APP_SECRET']);
}

const SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
].join(',');

export function metaAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: SCOPES,
  });
  return `${oauthBase()}/${API_VERSION}/dialog/oauth?${params}`;
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${graphBase()}/${API_VERSION}/${path.replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !data || data.error) {
    throw new Error(`Graph ${path}: ${data?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return data;
}

async function graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${graphBase()}/${API_VERSION}/${path.replace(/^\/+/, '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !data || data.error) {
    throw new Error(`Graph ${path}: ${data?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return data;
}

/** Exchange the OAuth code for a long-lived user token. */
export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const shortLived = await graphGet<{ access_token: string }>('oauth/access_token', {
    client_id: appId(),
    client_secret: appSecret(),
    redirect_uri: redirectUri,
    code,
  });
  const longLived = await graphGet<{ access_token: string }>('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId(),
    client_secret: appSecret(),
    fb_exchange_token: shortLived.access_token,
  });
  return longLived.access_token;
}

export interface DiscoveredAccount {
  platform: 'facebook' | 'instagram';
  externalId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Page access token (IG publishing also uses the owning page's token). */
  accessToken: string;
  meta: Record<string, unknown>;
}

/** List the user's Pages and any linked Instagram Business accounts. */
export async function discoverAccounts(userToken: string): Promise<DiscoveredAccount[]> {
  const pages = await graphGet<{
    data: Array<{
      id: string;
      name: string;
      access_token: string;
      picture?: { data?: { url?: string } };
      instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
    }>;
  }>('me/accounts', {
    access_token: userToken,
    fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}',
  });

  const accounts: DiscoveredAccount[] = [];
  for (const page of pages.data ?? []) {
    accounts.push({
      platform: 'facebook',
      externalId: page.id,
      displayName: page.name,
      avatarUrl: page.picture?.data?.url ?? null,
      accessToken: page.access_token,
      meta: { pageId: page.id },
    });
    if (page.instagram_business_account?.id) {
      accounts.push({
        platform: 'instagram',
        externalId: page.instagram_business_account.id,
        displayName: page.instagram_business_account.username
          ? `@${page.instagram_business_account.username}`
          : `${page.name} (Instagram)`,
        avatarUrl: page.instagram_business_account.profile_picture_url ?? null,
        // IG content publishing authorises with the linked Page's token.
        accessToken: page.access_token,
        meta: { igUserId: page.instagram_business_account.id, pageId: page.id },
      });
    }
  }
  return accounts;
}

export interface PublishInput {
  body: string;
  linkUrl?: string | null;
  imageUrl?: string | null;
}

export interface PublishResult {
  platformPostId: string;
  platformUrl: string | null;
}

/** Publish to a Facebook Page (feed post, or photo post when an image is attached). */
export async function publishToFacebook(
  account: { externalId: string; accessTokenEnc: string | null },
  input: PublishInput,
): Promise<PublishResult> {
  if (!account.accessTokenEnc) throw new Error('Account has no stored token — reconnect it');
  const token = decryptToken(account.accessTokenEnc);

  if (input.imageUrl?.trim()) {
    const res = await graphPost<{ id: string; post_id?: string }>(`${account.externalId}/photos`, {
      url: input.imageUrl.trim(),
      caption: [input.body, input.linkUrl ?? ''].filter(Boolean).join('\n\n'),
      access_token: token,
    });
    const postId = res.post_id ?? res.id;
    return { platformPostId: postId, platformUrl: `https://www.facebook.com/${postId}` };
  }

  const params: Record<string, string> = { message: input.body, access_token: token };
  if (input.linkUrl?.trim()) params['link'] = input.linkUrl.trim();
  const res = await graphPost<{ id: string }>(`${account.externalId}/feed`, params);
  return { platformPostId: res.id, platformUrl: `https://www.facebook.com/${res.id}` };
}

/** Publish to Instagram Business (two-step: create media container, then publish it). */
export async function publishToInstagram(
  account: { externalId: string; accessTokenEnc: string | null },
  input: PublishInput,
): Promise<PublishResult> {
  if (!account.accessTokenEnc) throw new Error('Account has no stored token — reconnect it');
  if (!input.imageUrl?.trim()) throw new Error('Instagram requires an image');
  const token = decryptToken(account.accessTokenEnc);

  const caption = [input.body, input.linkUrl ?? ''].filter(Boolean).join('\n\n');
  const container = await graphPost<{ id: string }>(`${account.externalId}/media`, {
    image_url: input.imageUrl.trim(),
    caption,
    access_token: token,
  });
  const published = await graphPost<{ id: string }>(`${account.externalId}/media_publish`, {
    creation_id: container.id,
    access_token: token,
  });
  return { platformPostId: published.id, platformUrl: null };
}
