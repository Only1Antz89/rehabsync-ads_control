/**
 * LinkedIn (Community Management API) — organisation-page publishing via 3-legged OAuth.
 *
 * Endpoints are env-overridable (REHABSYNC_LINKEDIN_OAUTH_URL / REHABSYNC_LINKEDIN_API_URL) so the
 * pipeline can be exercised end-to-end against a stub; production uses the real hosts. App approval
 * for the Community Management product is an external prerequisite — until credentials are set,
 * LinkedIn targets fall back to manual-export.
 */
import { and, eq } from 'drizzle-orm';
import { adsSocialAccounts, getDb } from '@/db';
import { decryptToken, encryptToken } from '@/lib/crypto';

const LINKEDIN_VERSION = '202506';

function oauthBase(): string {
  return (process.env['REHABSYNC_LINKEDIN_OAUTH_URL'] ?? 'https://www.linkedin.com').replace(/\/+$/, '');
}

function apiBase(): string {
  return (process.env['REHABSYNC_LINKEDIN_API_URL'] ?? 'https://api.linkedin.com').replace(/\/+$/, '');
}

function clientId(): string {
  const id = process.env['LINKEDIN_CLIENT_ID'];
  if (!id) throw new Error('LINKEDIN_CLIENT_ID is not set');
  return id;
}

function clientSecret(): string {
  const secret = process.env['LINKEDIN_CLIENT_SECRET'];
  if (!secret) throw new Error('LINKEDIN_CLIENT_SECRET is not set');
  return secret;
}

export function linkedinConfigured(): boolean {
  return Boolean(process.env['LINKEDIN_CLIENT_ID'] && process.env['LINKEDIN_CLIENT_SECRET']);
}

const SCOPES = 'w_organization_social r_organization_social rw_organization_admin';

export function linkedinAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
  });
  return `${oauthBase()}/oauth/v2/authorization?${params}`;
}

export interface LinkedInTokens {
  accessToken: string;
  expiresInSecs: number;
  refreshToken: string | null;
}

async function tokenRequest(params: Record<string, string>): Promise<LinkedInTokens> {
  const res = await fetch(`${oauthBase()}/oauth/v2/accessToken`, {
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
    throw new Error(`LinkedIn token: ${data?.error_description ?? `HTTP ${res.status}`}`);
  }
  return {
    accessToken: data.access_token,
    expiresInSecs: data.expires_in ?? 3600,
    refreshToken: data.refresh_token ?? null,
  };
}

export function exchangeLinkedInCode(code: string, redirectUri: string): Promise<LinkedInTokens> {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId(),
    client_secret: clientSecret(),
  });
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': LINKEDIN_VERSION,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !data) throw new Error(`LinkedIn ${path}: ${data?.message ?? `HTTP ${res.status}`}`);
  return data;
}

export interface DiscoveredOrg {
  platform: 'linkedin';
  externalId: string; // numeric organisation id
  displayName: string;
  avatarUrl: string | null;
  meta: Record<string, unknown>;
}

/** Organisations the connecting member administers (Community Management ACLs). */
export async function discoverOrganizations(accessToken: string): Promise<DiscoveredOrg[]> {
  const acls = await apiGet<{ elements?: Array<{ organization?: string }> }>(
    '/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
    accessToken,
  );
  const orgs: DiscoveredOrg[] = [];
  for (const element of acls.elements ?? []) {
    const urn = element.organization;
    const id = urn?.split(':').pop();
    if (!urn || !id) continue;
    let name = `LinkedIn organisation ${id}`;
    try {
      const org = await apiGet<{ localizedName?: string }>(`/v2/organizations/${id}`, accessToken);
      if (org.localizedName) name = org.localizedName;
    } catch {
      // Keep the placeholder name — discovery should not fail on a lookup hiccup.
    }
    orgs.push({ platform: 'linkedin', externalId: id, displayName: name, avatarUrl: null, meta: { orgUrn: urn } });
  }
  return orgs;
}

// ── Publishing ────────────────────────────────────────────────────────────────

type Account = typeof adsSocialAccounts.$inferSelect;

/** Decrypted, non-expired access token — refreshes (and persists) when possible. */
async function ensureToken(account: Account): Promise<string> {
  if (!account.accessTokenEnc) throw new Error('Account has no stored token — reconnect it');
  const expired = account.tokenExpiresAt !== null && account.tokenExpiresAt.getTime() < Date.now() + 60000;
  if (!expired) return decryptToken(account.accessTokenEnc);

  if (!account.refreshTokenEnc) throw new Error('LinkedIn token expired — reconnect the account');
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
    .where(and(eq(adsSocialAccounts.id, account.id), eq(adsSocialAccounts.platform, 'linkedin')));
  return refreshed.accessToken;
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

/** Upload an image by URL into LinkedIn's asset store; returns the image URN. */
async function uploadImage(accessToken: string, ownerUrn: string, imageUrl: string): Promise<string> {
  const init = await fetch(`${apiBase()}/rest/images?action=initializeUpload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': LINKEDIN_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const initData = (await init.json().catch(() => null)) as {
    value?: { uploadUrl?: string; image?: string };
    message?: string;
  } | null;
  if (!init.ok || !initData?.value?.uploadUrl || !initData.value.image) {
    throw new Error(`LinkedIn image init: ${initData?.message ?? `HTTP ${init.status}`}`);
  }

  const source = await fetch(imageUrl, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!source.ok) throw new Error(`LinkedIn image fetch: source returned HTTP ${source.status}`);
  const bytes = await source.arrayBuffer();

  const put = await fetch(initData.value.uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' },
    body: bytes,
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });
  if (!put.ok) throw new Error(`LinkedIn image upload: HTTP ${put.status}`);
  return initData.value.image;
}

/** Publish to a LinkedIn organisation page (text, article link, or image post). */
export async function publishToLinkedIn(account: Account, input: PublishInput): Promise<PublishResult> {
  const accessToken = await ensureToken(account);
  const authorUrn = (account.meta['orgUrn'] as string | undefined) ?? `urn:li:organization:${account.externalId}`;

  const post: Record<string, unknown> = {
    author: authorUrn,
    commentary: input.body,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  if (input.imageUrl?.trim()) {
    // Image post; a link (if any) rides along in the commentary.
    const imageUrn = await uploadImage(accessToken, authorUrn, input.imageUrl.trim());
    post['content'] = { media: { id: imageUrn } };
    if (input.linkUrl?.trim()) post['commentary'] = `${input.body}\n\n${input.linkUrl.trim()}`;
  } else if (input.linkUrl?.trim()) {
    post['content'] = {
      article: {
        source: input.linkUrl.trim(),
        title: input.body.split('\n')[0]?.slice(0, 200) || 'RehabSync',
      },
    };
  }

  const res = await fetch(`${apiBase()}/rest/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': LINKEDIN_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(post),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`LinkedIn posts: ${data?.message ?? `HTTP ${res.status}`}`);
  }
  const postUrn = res.headers.get('x-restli-id');
  if (!postUrn) throw new Error('LinkedIn posts: response missing x-restli-id');
  return {
    platformPostId: postUrn,
    platformUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`,
  };
}
