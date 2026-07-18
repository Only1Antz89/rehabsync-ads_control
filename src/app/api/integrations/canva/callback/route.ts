import { NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { exchangeCode, saveConnection } from '@/lib/canva/oauth';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'rs_canva_state';
const VERIFIER_COOKIE = 'rs_canva_verifier';
const COOKIE_PATH = '/api/integrations/canva';

function readCookie(req: Request, name: string): string | undefined {
  return req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function back(req: Request, query: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/admin/canva?${query}`, req.url));
  res.cookies.set(STATE_COOKIE, '', { path: COOKIE_PATH, maxAge: 0 });
  res.cookies.set(VERIFIER_COOKIE, '', { path: COOKIE_PATH, maxAge: 0 });
  return res;
}

/** Complete Canva OAuth: verify state, exchange the code with the PKCE verifier, store tokens. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session)) return back(req, 'error=forbidden');

  const url = new URL(req.url);
  if (url.searchParams.get('error')) return back(req, 'error=denied');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = readCookie(req, STATE_COOKIE);
  const verifier = readCookie(req, VERIFIER_COOKIE);
  if (!code || !state || !cookieState || state !== cookieState || !verifier) {
    return back(req, 'error=state_mismatch');
  }

  const origin = process.env['NEXT_PUBLIC_APP_URL'] ?? url.origin;
  const tokens = await exchangeCode(code, verifier, origin);
  if ('error' in tokens) return back(req, 'error=exchange_failed');

  // Never strand the user on a raw 500 mid-OAuth: if persisting the connection fails (e.g. the
  // database or REHABSYNC_ENCRYPTION_KEY isn't configured), redirect back to the settings screen
  // with an error the page can show.
  try {
    await saveConnection(tokens, session.email);
    await recordAudit(session, 'canva_connected', 'canva_connection', null, {});
  } catch (err) {
    console.error('[canva/callback] failed to save connection:', (err as Error).message);
    return back(req, 'error=save_failed');
  }
  return back(req, 'connected=1');
}
