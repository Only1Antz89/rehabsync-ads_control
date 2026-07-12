import { NextResponse } from 'next/server';
import { ingestMention, normalizeMention } from '@/lib/listening';

export const dynamic = 'force-dynamic';

/**
 * Social-listening ingest webhook. A normalising gateway (per-network search/mention APIs) posts
 * matched public mentions here. Shares the engagement webhook secret (REHABSYNC_INBOX_WEBHOOK_SECRET).
 */
export async function POST(req: Request) {
  const secret = process.env['REHABSYNC_INBOX_WEBHOOK_SECRET'];
  if (!secret) return NextResponse.json({ error: 'Listening webhook not configured.' }, { status: 503 });
  const provided = req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('secret');
  if (provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = normalizeMention(await req.json().catch(() => null));
  if ('error' in payload) return NextResponse.json({ error: payload.error }, { status: 400 });

  const { id, created, queryId } = await ingestMention(payload);
  return NextResponse.json({ ok: true, id, created, queryId }, { status: created ? 201 : 200 });
}
