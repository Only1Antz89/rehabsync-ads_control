import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { computeShareOfVoice } from '@/lib/share-of-voice';

export const dynamic = 'force-dynamic';

/** Share-of-voice across tracked brands over the last `days` (default 30). */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const days = Number(new URL(req.url).searchParams.get('days')) || 30;
  return NextResponse.json(await computeShareOfVoice(days));
}
