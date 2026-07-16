import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { getCanvaContentItem } from '@/lib/canva/sync';
import { publishCanvaDesign } from '@/lib/canva/publish';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Body {
  accountIds?: string[];
  manualPlatforms?: string[];
  body?: string;
  linkUrl?: string | null;
}

/** Publish a prepared Canva design and, on full success, move it to the Published folder. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const { id } = await params;
  const item = await getCanvaContentItem(id);
  if (!item) return NextResponse.json({ error: 'Design not found. Sync the library and try again.' }, { status: 404 });

  const input = ((await req.json().catch(() => null)) ?? {}) as Body;
  const result = await publishCanvaDesign(item, input, session);

  await recordAudit(session, 'canva_design_published', 'canva_content', item.id, {
    designId: item.canvaDesignId,
    ok: result.ok,
    ...(result.ok
      ? { jobId: result.jobId, postId: result.postId, status: result.status, moveStatus: result.moveStatus }
      : { error: result.error }),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
