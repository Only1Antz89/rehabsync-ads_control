import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsPosts, getDb } from '@/db';
import { recordAudit } from '@/lib/audit';
import { publishPostNow } from '@/lib/publisher';
import { isResponse, requireAdmin } from '@/lib/route-auth';

type Params = { params: Promise<{ id: string }> };

/** Approve or reject a post awaiting approval (admin). Approving a due scheduled post publishes it. */
export async function PATCH(req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    action?: 'approve' | 'reject';
    note?: string;
  } | null;
  if (!body?.action || !['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'action must be approve or reject.' }, { status: 400 });
  }

  const db = getDb();
  const [post] = await db.select().from(adsPosts).where(eq(adsPosts.id, id)).limit(1);
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (post.approvalStatus !== 'pending' && !(body.action === 'approve' && post.approvalStatus === 'rejected')) {
    return NextResponse.json({ error: `Post is already ${post.approvalStatus}.` }, { status: 409 });
  }

  if (body.action === 'reject') {
    await db
      .update(adsPosts)
      .set({
        approvalStatus: 'rejected',
        approvalNote: body.note?.slice(0, 500) ?? null,
        approvedBy: session.email,
        approvedAt: new Date(),
        // Back to draft so the author can rework it; it can be approved later without edits too.
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(adsPosts.id, id));
    await recordAudit(session, 'post_rejected', 'ads_post', id, { note: body.note ?? null });
    return NextResponse.json({ ok: true });
  }

  await db
    .update(adsPosts)
    .set({
      approvalStatus: 'approved',
      approvalNote: body.note?.slice(0, 500) ?? null,
      approvedBy: session.email,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(adsPosts.id, id));
  await recordAudit(session, 'post_approved', 'ads_post', id, {});

  // A due scheduled post goes out immediately rather than waiting for the next cron tick.
  let published: string | null = null;
  if (post.status === 'scheduled' && post.scheduledAt && post.scheduledAt.getTime() <= Date.now()) {
    try {
      published = await publishPostNow(id);
    } catch (err) {
      console.error('[approval] publish after approve failed', id, (err as Error).message);
    }
  }
  return NextResponse.json({ ok: true, published });
}
