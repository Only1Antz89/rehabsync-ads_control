import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { adsSocialAccounts, getDb } from '@/db';
import { getSession, isAdmin } from '@/lib/auth';
import { encryptToken } from '@/lib/crypto';
import { discoverChannels, exchangeGoogleCode } from '@/lib/social/youtube';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'rs_ads_yt_state';

function backTo(req: Request, query: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/admin/connections?${query}`, req.url));
  res.cookies.set(STATE_COOKIE, '', { path: '/api/oauth/youtube', maxAge: 0 });
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
    const redirectUri = `${origin.replace(/\/+$/, '')}/api/oauth/youtube/callback`;
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const channels = await discoverChannels(tokens.accessToken);
    if (channels.length === 0) {
      return backTo(req, 'error=no_channels');
    }

    const db = getDb();
    for (const channel of channels) {
      const values = {
        displayName: channel.displayName,
        avatarUrl: channel.avatarUrl,
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresInSecs * 1000),
        status: 'connected' as const,
        meta: channel.meta,
        connectedBy: session.email,
        updatedAt: new Date(),
      };
      const [existing] = await db
        .select({ id: adsSocialAccounts.id })
        .from(adsSocialAccounts)
        .where(
          and(eq(adsSocialAccounts.platform, 'youtube'), eq(adsSocialAccounts.externalId, channel.externalId)),
        )
        .limit(1);
      if (existing) {
        await db.update(adsSocialAccounts).set(values).where(eq(adsSocialAccounts.id, existing.id));
      } else {
        await db
          .insert(adsSocialAccounts)
          .values({ platform: 'youtube', externalId: channel.externalId, ...values });
      }
    }

    await recordAudit(session, 'accounts_connected', 'ads_social_account', null, {
      platform: 'youtube',
      count: channels.length,
    });
    return backTo(req, `connected=${channels.length}`);
  } catch (err) {
    console.error('[oauth/youtube] callback failed', err);
    return backTo(req, 'error=exchange_failed');
  }
}
