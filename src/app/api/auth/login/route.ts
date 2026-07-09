import { NextResponse } from 'next/server';
import { ADS_SESSION_COOKIE, sessionCookieOptions, staffLogin } from '@/lib/auth';

// Naive in-memory rate limit (per runtime instance): 10 attempts / 5 min / email.
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 5 * 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }
  if (rateLimited(email)) {
    return NextResponse.json({ error: 'Too many attempts — try again in a few minutes' }, { status: 429 });
  }

  const result = await staffLogin(email, password).catch(() => null);
  if (!result) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const res = NextResponse.json({ user: result.session });
  res.cookies.set(ADS_SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  return res;
}
