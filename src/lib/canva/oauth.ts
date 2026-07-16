import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { canvaConnections, getDb } from '@/db';
import { decryptToken, encryptToken } from '@/lib/crypto';

// Canva Connect OAuth 2.0 (Authorization Code + PKCE, SHA-256). Endpoints are env-overridable so the
// flow can be exercised against a stub in tests without reaching Canva.
const ROW_ID = 1;
const DEFAULT_AUTHORIZE = 'https://www.canva.com/api/oauth/authorize';
const DEFAULT_TOKEN = 'https://api.canva.com/rest/v1/oauth/token';

export const CANVA_SCOPES = ['folder:read', 'folder:write', 'design:meta:read', 'design:content:read'];

export function canvaApiUrl(): string {
  return (process.env['REHABSYNC_CANVA_API_URL'] ?? 'https://api.canva.com/rest/v1').replace(/\/+$/, '');
}

export function canvaConfigured(): boolean {
  return Boolean(process.env['CANVA_CLIENT_ID'] && process.env['CANVA_CLIENT_SECRET']);
}

export function canvaRedirectUri(origin: string): string {
  return process.env['CANVA_REDIRECT_URI'] || `${origin.replace(/\/+$/, '')}/api/integrations/canva/callback`;
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizeUrl(origin: string, state: string, challenge: string): string {
  const base = process.env['REHABSYNC_CANVA_AUTHORIZE_URL'] ?? DEFAULT_AUTHORIZE;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env['CANVA_CLIENT_ID'] ?? '',
    redirect_uri: canvaRedirectUri(origin),
    scope: CANVA_SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${base}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface CanvaTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scopes: string[];
}

async function tokenRequest(body: Record<string, string>): Promise<CanvaTokens | { error: string }> {
  const url = process.env['REHABSYNC_CANVA_TOKEN_URL'] ?? DEFAULT_TOKEN;
  const clientId = process.env['CANVA_CLIENT_ID'] ?? '';
  const clientSecret = process.env['CANVA_CLIENT_SECRET'] ?? '';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ client_id: clientId, ...body }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => null)) as TokenResponse | null;
    if (!res.ok || !data?.access_token) {
      return { error: data?.error_description ?? data?.error ?? `HTTP ${res.status}` };
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresIn: data.expires_in ?? 3600,
      scopes: data.scope ? data.scope.split(/\s+/).filter(Boolean) : CANVA_SCOPES,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function exchangeCode(code: string, verifier: string, origin: string): Promise<CanvaTokens | { error: string }> {
  return tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: canvaRedirectUri(origin) });
}

type Connection = typeof canvaConnections.$inferSelect;

export async function getConnection(): Promise<Connection> {
  const db = getDb();
  const [row] = await db.select().from(canvaConnections).where(eq(canvaConnections.id, ROW_ID)).limit(1);
  if (row) return row;
  await db.insert(canvaConnections).values({ id: ROW_ID }).onConflictDoNothing();
  const [created] = await db.select().from(canvaConnections).where(eq(canvaConnections.id, ROW_ID)).limit(1);
  return created!;
}

async function persistTokens(tokens: CanvaTokens, actorEmail: string | null): Promise<void> {
  const db = getDb();
  await getConnection();
  const set: Partial<typeof canvaConnections.$inferInsert> = {
    accessTokenEnc: encryptToken(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
    accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    scopes: tokens.scopes,
    status: 'connected',
    lastError: null,
    updatedAt: new Date(),
  };
  if (actorEmail) set.connectedBy = actorEmail;
  await db.update(canvaConnections).set(set).where(eq(canvaConnections.id, ROW_ID));
}

/** Store freshly-exchanged tokens after a successful connect. */
export async function saveConnection(tokens: CanvaTokens, actorEmail: string): Promise<void> {
  await persistTokens(tokens, actorEmail);
}

export async function disconnect(): Promise<void> {
  await getDb()
    .update(canvaConnections)
    .set({ accessTokenEnc: null, refreshTokenEnc: null, accessTokenExpiresAt: null, scopes: [], status: 'disconnected', lastError: null, updatedAt: new Date() })
    .where(eq(canvaConnections.id, ROW_ID));
}

async function markReauth(error: string): Promise<void> {
  await getDb()
    .update(canvaConnections)
    .set({ status: 'reauthorisation_required', lastError: error.slice(0, 300), updatedAt: new Date() })
    .where(eq(canvaConnections.id, ROW_ID));
}

/** Return a valid access token, refreshing server-side if it is expired/expiring. */
export async function getValidAccessToken(): Promise<{ token: string } | { error: string }> {
  const conn = await getConnection();
  if (conn.status === 'disconnected' || !conn.accessTokenEnc) return { error: 'Canva is not connected.' };

  const expiring = !conn.accessTokenExpiresAt || conn.accessTokenExpiresAt.getTime() < Date.now() + 60_000;
  if (!expiring) {
    try {
      return { token: decryptToken(conn.accessTokenEnc) };
    } catch {
      return { error: 'Stored Canva token could not be read.' };
    }
  }

  if (!conn.refreshTokenEnc) {
    await markReauth('Access token expired and no refresh token is available.');
    return { error: 'Canva session expired — please reconnect.' };
  }
  const refreshed = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decryptToken(conn.refreshTokenEnc) });
  if ('error' in refreshed) {
    await markReauth(refreshed.error);
    return { error: 'Canva session expired — please reconnect.' };
  }
  // Keep the previous refresh token if Canva didn't rotate it.
  await persistTokens({ ...refreshed, refreshToken: refreshed.refreshToken ?? decryptToken(conn.refreshTokenEnc) }, null);
  return { token: refreshed.accessToken };
}
