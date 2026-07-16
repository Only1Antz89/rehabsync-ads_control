import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSession, isAdmin } from '@/lib/auth';
import { authorizeUrl, canvaConfigured, generatePkce } from '@/lib/canva/oauth';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'rs_canva_state';
const VERIFIER_COOKIE = 'rs_canva_verifier';
const COOKIE_PATH = '/api/integrations/canva';

/** Begin Canva OAuth (PKCE). Admin-only; stashes state + code_verifier in httpOnly cookies. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session)) return NextResponse.redirect(new URL('/admin/canva?error=forbidden', req.url));
  if (!canvaConfigured()) return NextResponse.redirect(new URL('/admin/canva?error=not_configured', req.url));

  const origin = process.env['NEXT_PUBLIC_APP_URL'] ?? new URL(req.url).origin;
  const state = randomBytes(16).toString('base64url');
  const { verifier, challenge } = generatePkce();

  const res = NextResponse.redirect(authorizeUrl(origin, state, challenge));
  const opts = {
    httpOnly: true,
    secure: process.env['REHABSYNC_NODE_ENV'] === 'production',
    sameSite: 'lax' as const,
    path: COOKIE_PATH,
    maxAge: 600,
  };
  res.cookies.set(STATE_COOKIE, state, opts);
  res.cookies.set(VERIFIER_COOKIE, verifier, opts);
  return res;
}
