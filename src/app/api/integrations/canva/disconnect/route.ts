import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { disconnect } from '@/lib/canva/oauth';
import { recordAudit } from '@/lib/audit';

/** Disconnect Canva (clears stored tokens). Admin only. */
export async function POST() {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  await disconnect();
  await recordAudit(session, 'canva_disconnected', 'canva_connection', null, {});
  return NextResponse.json({ ok: true });
}
