import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { adsPostTargets, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recomputePostStatus } from '@/lib/publisher';
import { recordAudit } from '@/lib/audit';

/** Mark a manual-export target done (or reopen it) after posting by hand on the platform. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id, targetId } = await params;
  const db = getDb();

  const body = (await req.json().catch(() => null)) as {
    status?: 'manual_done' | 'manual';
    platformUrl?: string | null;
  } | null;
  if (!body || (body.status !== 'manual_done' && body.status !== 'manual')) {
    return NextResponse.json({ error: 'status must be manual_done or manual' }, { status: 400 });
  }

  const [target] = await db
    .select()
    .from(adsPostTargets)
    .where(and(eq(adsPostTargets.id, targetId), eq(adsPostTargets.postId, id)))
    .limit(1);
  if (!target) return NextResponse.json({ error: 'Target not found' }, { status: 404 });
  if (target.status !== 'manual' && target.status !== 'manual_done') {
    return NextResponse.json({ error: 'Only manual-export targets can be marked here' }, { status: 400 });
  }

  await db
    .update(adsPostTargets)
    .set({
      status: body.status,
      platformUrl: body.platformUrl?.trim() || target.platformUrl,
      publishedAt: body.status === 'manual_done' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(adsPostTargets.id, targetId));

  const postStatus = await recomputePostStatus(id);
  await recordAudit(session, body.status === 'manual_done' ? 'manual_target_done' : 'manual_target_reopened', 'ads_post_target', targetId, {
    platform: target.platform,
  });
  return NextResponse.json({ ok: true, postStatus });
}
