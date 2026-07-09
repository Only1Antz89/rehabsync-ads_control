import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSession, isAdmin } from '@/lib/auth';
import { youtubeAuthUrl, youtubeConfigured } from '@/lib/social/youtube';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'rs_ads_yt_state';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.redirect(new URL('/admin/connections?error=forbidden', req.url));
  }
  if (!youtubeConfigured()) {
    return NextResponse.redirect(new URL('/admin/connections?error=youtube_not_configured', req.url));
  }

  const origin = process.env['NEXT_PUBLIC_APP_URL'] ?? new URL(req.url).origin;
  const redirectUri = `${origin.replace(/\/+$/, '')}/api/oauth/youtube/callback`;
  const state = randomBytes(16).toString('base64url');

  const res = NextResponse.redirect(youtubeAuthUrl(redirectUri, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env['REHABSYNC_NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/api/oauth/youtube',
    maxAge: 600,
  });
  return res;
}
