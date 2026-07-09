import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { getDb, staffSessions, staffToolRoles, staffUsers } from '@/db';
import { verifyPassword } from './password';

/** Cookie set by the main RehabSync API for platform admins (SSO — domain-widened to .rehabsync.app). */
export const PLATFORM_SESSION_COOKIE = 'rs_platform_session';
/** Cookie owned by this app for staff (tool-level) sessions. */
export const ADS_SESSION_COOKIE = 'rs_ads_session';

const TOOL = 'ads' as const;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type SessionRole = 'super_admin' | 'admin' | 'user';

export interface Session {
  kind: 'platform_admin' | 'staff';
  userId: string | null;
  email: string;
  name: string;
  role: SessionRole;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Verify a platform super-admin SSO cookie against the main RehabSync API. Auth logic stays in
 * one place (the platform), so revoked admin sessions are respected here immediately. Only
 * `super_admin` is accepted — mirrors the main app's admin-route-proxy behaviour.
 */
async function resolvePlatformSession(token: string): Promise<Session | null> {
  const apiUrl = process.env['REHABSYNC_API_URL'];
  if (!apiUrl) return null;
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/v1/admin/auth/me`, {
      headers: { cookie: `${PLATFORM_SESSION_COOKIE}=${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      admin?: { email?: string; name?: string; role?: string };
    } | null;
    if (data?.admin?.role !== 'super_admin' || !data.admin.email) return null;
    return {
      kind: 'platform_admin',
      userId: null,
      email: data.admin.email,
      name: data.admin.name ?? data.admin.email,
      role: 'super_admin',
    };
  } catch {
    return null;
  }
}

async function resolveStaffSession(token: string): Promise<Session | null> {
  const db = getDb();
  const [row] = await db
    .select({
      sessionId: staffSessions.id,
      userId: staffUsers.id,
      email: staffUsers.email,
      name: staffUsers.name,
      status: staffUsers.status,
    })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.userId))
    .where(
      and(
        eq(staffSessions.tokenHash, hashToken(token)),
        eq(staffSessions.tool, TOOL),
        gt(staffSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row || row.status !== 'active') return null;

  const [membership] = await db
    .select({ role: staffToolRoles.role })
    .from(staffToolRoles)
    .where(and(eq(staffToolRoles.userId, row.userId), eq(staffToolRoles.tool, TOOL)))
    .limit(1);
  if (!membership || (membership.role !== 'admin' && membership.role !== 'user')) return null;

  // Best-effort presence update; never block auth on it.
  db.update(staffSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(staffSessions.id, row.sessionId))
    .then(
      () => undefined,
      () => undefined,
    );

  return {
    kind: 'staff',
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: membership.role,
  };
}

/** Resolve the caller's session: staff cookie first (cheap, local), then platform SSO. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();

  const staffToken = jar.get(ADS_SESSION_COOKIE)?.value;
  if (staffToken) {
    const session = await resolveStaffSession(staffToken).catch(() => null);
    if (session) return session;
  }

  const platformToken = jar.get(PLATFORM_SESSION_COOKIE)?.value;
  if (platformToken) {
    return resolvePlatformSession(platformToken);
  }

  return null;
}

export function isAdmin(session: Session): boolean {
  return session.role === 'admin' || session.role === 'super_admin';
}

/** Staff email+password login. Returns the raw token to set as the session cookie. */
export async function staffLogin(
  email: string,
  password: string,
): Promise<{ token: string; expiresAt: Date; session: Session } | null> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.email, email.trim().toLowerCase()))
    .limit(1);
  if (!user || user.status !== 'active' || !verifyPassword(password, user.passwordHash)) {
    return null;
  }

  const [membership] = await db
    .select({ role: staffToolRoles.role })
    .from(staffToolRoles)
    .where(and(eq(staffToolRoles.userId, user.id), eq(staffToolRoles.tool, TOOL)))
    .limit(1);
  if (!membership || (membership.role !== 'admin' && membership.role !== 'user')) return null;

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(staffSessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    tool: TOOL,
    expiresAt,
  });

  return {
    token,
    expiresAt,
    session: {
      kind: 'staff',
      userId: user.id,
      email: user.email,
      name: user.name,
      role: membership.role,
    },
  };
}

export async function staffLogout(token: string | undefined): Promise<void> {
  if (!token) return;
  await getDb().delete(staffSessions).where(eq(staffSessions.tokenHash, hashToken(token)));
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true as const,
    secure: process.env['REHABSYNC_NODE_ENV'] === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}
