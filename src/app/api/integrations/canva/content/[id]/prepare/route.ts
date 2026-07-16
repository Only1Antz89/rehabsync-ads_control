import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { getCanvaContentItem } from '@/lib/canva/sync';
import { exportDesignToMedia } from '@/lib/canva/export';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Render a synced Canva design and store it as a composer-ready media asset. Any staff may run it. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const { id } = await params;
  const item = await getCanvaContentItem(id);
  if (!item) return NextResponse.json({ error: 'Design not found. Sync the library and try again.' }, { status: 404 });

  const result = await exportDesignToMedia(
    { contentItemId: item.id, designId: item.canvaDesignId, title: item.title },
    session.email,
  );
  await recordAudit(session, 'canva_design_prepared', 'canva_content', item.id, {
    designId: item.canvaDesignId,
    ok: result.ok,
    ...(result.ok ? { mediaId: result.mediaId, reused: result.reused } : { error: result.error }),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, mediaId: result.mediaId, url: result.url, reused: result.reused });
}
