import { NextResponse } from 'next/server';
import type { NewsletterSegment } from '@/db';
import { resolveAudience } from '@/lib/newsletters';
import { isResponse, requireSession } from '@/lib/route-auth';

/** Audience size for a segment (active subscribers after suppressions). */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { segment?: { tags?: string[] } } | null;
  const segment: NewsletterSegment = {};
  const tags = (body?.segment?.tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (tags.length) segment.tags = tags;

  const audience = await resolveAudience(segment);
  return NextResponse.json({ count: audience.length });
}
