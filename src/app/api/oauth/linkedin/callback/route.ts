import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { adsSocialAccounts, getDb } from '@/db';
import { getSession, isAdmin } from '@/lib/auth';
import { encryptToken } from '@/lib/crypto';
import { discoverOrganizations, exchangeLinkedInCode } from '@/lib/social/linkedin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'rs_ads_li_state';

function backTo(req: Request, query: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/admin/connections?${query}`, req.url));
  res.cookies.set(STATE_COOKIE, '', { path: '/api/oauth/linkedin', maxAge: 0 });
  return res;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session)) return backTo(req, 'error=forbidden');

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  if (url.searchParams.get('error')) return backTo(req, 'error=denied');
  if (!code || !state || !cookieState || state !== cookieState) {
    return backTo(req, 'error=state_mismatch');
  }

  try {
    const origin = process.env['NEXT_PUBLIC_APP_URL'] ?? url.origin;
    const redirectUri = `${origin.replace(/\/+$/, '')}/api/oauth/linkedin/callback`;
    const tokens = await exchangeLinkedInCode(code, redirectUri);
    const organizations = await discoverOrganizations(tokens.accessToken);
    if (organizations.length === 0) {
      return backTo(req, 'error=no_orgs');
    }

    const db = getDb();
    for (const org of organizations) {
      const values = {
        displayName: org.displayName,
        avatarUrl: org.avatarUrl,
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresInSecs * 1000),
        status: 'connected' as const,
        meta: org.meta,
        connectedBy: session.email,
        updatedAt: new Date(),
      };
      const [existing] = await db
        .select({ id: adsSocialAccounts.id })
        .from(adsSocialAccounts)
        .where(
          and(eq(adsSocialAccounts.platform, 'linkedin'), eq(adsSocialAccounts.externalId, org.externalId)),
        )
        .limit(1);
      if (existing) {
        await db.update(adsSocialAccounts).set(values).where(eq(adsSocialAccounts.id, existing.id));
      } else {
        await db.insert(adsSocialAccounts).values({ platform: 'linkedin', externalId: org.externalId, ...values });
      }
    }

    await recordAudit(session, 'accounts_connected', 'ads_social_account', null, {
      platform: 'linkedin',
      count: organizations.length,
    });
    return backTo(req, `connected=${organizations.length}`);
  } catch (err) {
    console.error('[oauth/linkedin] callback failed', err);
    return backTo(req, 'error=exchange_failed');
  }
}
