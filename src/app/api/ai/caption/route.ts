import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { craftCaption } from '@/lib/ai';
import type { CaptionMode } from '@/lib/ai';
import { getBrandKit } from '@/lib/brand';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MODES: CaptionMode[] = ['draft', 'improve', 'shorten', 'hashtags'];

/** AI caption assist for the composer — drafts or refines a caption the human then edits. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as
    | { mode?: string; platform?: string; topic?: string; text?: string }
    | null;
  const mode = body?.mode as CaptionMode | undefined;
  if (!mode || !MODES.includes(mode)) return NextResponse.json({ error: 'Unknown mode.' }, { status: 400 });
  if (mode === 'draft' && !body?.topic?.trim()) {
    return NextResponse.json({ error: 'Describe what the post is about.' }, { status: 400 });
  }
  if (mode !== 'draft' && !body?.text?.trim()) {
    return NextResponse.json({ error: 'Provide the caption text to work from.' }, { status: 400 });
  }

  const brand = await getBrandKit().catch(() => null);
  const result = await craftCaption({
    mode,
    platform: body?.platform,
    topic: body?.topic,
    text: body?.text,
    voice: brand?.voice ?? undefined,
  });
  if (result.source === 'unavailable') {
    return NextResponse.json(
      { error: result.error ?? 'AI is not configured — set REHABSYNC_AI_URL and REHABSYNC_AI_API_KEY.' },
      { status: 503 },
    );
  }
  return NextResponse.json({ suggestion: result.suggestion });
}
