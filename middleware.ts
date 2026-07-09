import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/health', '/api/auth/login', '/api/health'];

/**
 * Cheap gate: redirect to /login when no session cookie of either kind is present. This only
 * checks cookie PRESENCE (edge runtime can't do scrypt/DB); the authoritative check is
 * `getSession()` in the app layout and in every route handler.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const hasStaff = req.cookies.has('rs_ads_session');
  const hasPlatform = req.cookies.has('rs_platform_session');
  if (!hasStaff && !hasPlatform) {
    const login = new URL('/login', req.url);
    if (pathname !== '/') login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
