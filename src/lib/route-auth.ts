import { NextResponse } from 'next/server';
import { getSession, isAdmin } from './auth';
import type { Session } from './auth';

/** Route-handler guard: any authenticated Ads Centre session (user, admin, or platform SSO). */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

/** Route-handler guard: tool admins and platform super-admins only. */
export async function requireAdmin(): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  return session;
}

export function isResponse(value: Session | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
