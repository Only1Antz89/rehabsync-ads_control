import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { adsSocialAccounts, getDb } from '@/db';
import { getSession, isAdmin } from '@/lib/auth';
import { encryptToken } from '@/lib/crypto';
import { discoverAccounts, exchangeCode } from '@/lib/social/meta';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'rs_ads_oauth_state';

function backTo(req: Request, query: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/admin/connections?${query}`, req.url));
  res.cookies.set(STATE_COOKIE, '', { path: '/api/oauth/meta', maxAge: 0 });
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
    const redirectUri = `${origin.replace(/\/+$/, '')}/api/oauth/meta/callback`;
    const userToken = await exchangeCode(code, redirectUri);
    const discovered = await discoverAccounts(userToken);
    if (discovered.length === 0) {
      return backTo(req, 'error=no_pages');
    }

    const db = getDb();
    for (const account of discovered) {
      const values = {
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        accessTokenEnc: encryptToken(account.accessToken),
        status: 'connected' as const,
        meta: account.meta,
        connectedBy: session.email,
        updatedAt: new Date(),
      };
      const [existing] = await db
        .select({ id: adsSocialAccounts.id })
        .from(adsSocialAccounts)
        .where(
          and(
            eq(adsSocialAccounts.platform, account.platform),
            eq(adsSocialAccounts.externalId, account.externalId),
          ),
        )
        .limit(1);
      if (existing) {
        await db.update(adsSocialAccounts).set(values).where(eq(adsSocialAccounts.id, existing.id));
      } else {
        await db.insert(adsSocialAccounts).values({
          platform: account.platform,
          externalId: account.externalId,
          ...values,
        });
      }
    }

    await recordAudit(session, 'accounts_connected', 'ads_social_account', null, {
      platform: 'meta',
      count: discovered.length,
    });
    return backTo(req, `connected=${discovered.length}`);
  } catch (err) {
    console.error('[oauth/meta] callback failed', err);
    return backTo(req, 'error=exchange_failed');
  }
}
