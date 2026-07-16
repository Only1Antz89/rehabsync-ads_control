import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { CANVA_STAGES, type CanvaStage } from '@/db/schema';
import { listCanvaContent } from '@/lib/canva/sync';

export const dynamic = 'force-dynamic';

/** List synced Canva designs (optionally one workflow stage). Any authenticated staff may browse. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const raw = new URL(req.url).searchParams.get('stage');
  const stage = raw && (CANVA_STAGES as readonly string[]).includes(raw) ? (raw as CanvaStage) : undefined;
  const items = await listCanvaContent(stage);
  return NextResponse.json({
    stage: stage ?? 'all',
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      stage: i.stage,
      stages: i.stages,
      thumbnailUrl: i.thumbnailUrl,
      lastSyncedAt: i.lastSyncedAt,
    })),
  });
}
