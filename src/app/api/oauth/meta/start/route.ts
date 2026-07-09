import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSession, isAdmin } from '@/lib/auth';
import { metaAuthUrl, metaConfigured } from '@/lib/social/meta';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'rs_ads_oauth_state';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.redirect(new URL('/admin/connections?error=forbidden', req.url));
  }
  if (!metaConfigured()) {
    return NextResponse.redirect(new URL('/admin/connections?error=meta_not_configured', req.url));
  }

  const origin = process.env['NEXT_PUBLIC_APP_URL'] ?? new URL(req.url).origin;
  const redirectUri = `${origin.replace(/\/+$/, '')}/api/oauth/meta/callback`;
  const state = randomBytes(16).toString('base64url');

  const res = NextResponse.redirect(metaAuthUrl(redirectUri, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env['REHABSYNC_NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/api/oauth/meta',
    maxAge: 600,
  });
  return res;
}
