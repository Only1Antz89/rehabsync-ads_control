import { NextResponse } from 'next/server';
import { ingestInbound, normalizeInbound } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

/**
 * Inbound engagement webhook. Point each network's webhook (via a normalising gateway) here.
 * Guarded by REHABSYNC_INBOX_WEBHOOK_SECRET (header `x-webhook-secret` or `?secret=`).
 */
export async function POST(req: Request) {
  const secret = process.env['REHABSYNC_INBOX_WEBHOOK_SECRET'];
  if (!secret) return NextResponse.json({ error: 'Inbox webhook not configured.' }, { status: 503 });
  const provided = req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('secret');
  if (provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = normalizeInbound(await req.json().catch(() => null));
  if ('error' in payload) return NextResponse.json({ error: payload.error }, { status: 400 });

  const { threadId, created } = await ingestInbound(payload);
  return NextResponse.json({ ok: true, threadId, created }, { status: created ? 201 : 200 });
}
