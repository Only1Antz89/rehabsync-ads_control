import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADS_SESSION_COOKIE, staffLogout } from '@/lib/auth';

export async function POST() {
  const jar = await cookies();
  await staffLogout(jar.get(ADS_SESSION_COOKIE)?.value).catch(() => undefined);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADS_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
