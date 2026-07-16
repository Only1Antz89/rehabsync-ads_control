import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsPostTargets, adsPosts, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

/**
 * Recycle an existing post into a fresh draft — copies the caption, media, tags and target set so an
 * evergreen post can be re-scheduled. The clone starts as an unscheduled draft with pending targets
 * (platform post ids / errors are not carried over).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const db = getDb();

  const [orig] = await db.select().from(adsPosts).where(eq(adsPosts.id, id)).limit(1);
  if (!orig) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  const targets = await db.select().from(adsPostTargets).where(eq(adsPostTargets.postId, id));

  const [clone] = await db
    .insert(adsPosts)
    .values({
      body: orig.body,
      linkUrl: orig.linkUrl,
      imageUrl: orig.imageUrl,
      imageUrls: orig.imageUrls,
      videoUrl: orig.videoUrl,
      title: orig.title,
      status: 'draft',
      approvalStatus: 'approved',
      tags: orig.tags,
      createdBy: session.email,
    })
    .returning();

  if (targets.length) {
    await db.insert(adsPostTargets).values(
      targets.map((t) => ({
        postId: clone!.id,
        accountId: t.accountId,
        platform: t.platform,
        bodyOverride: t.bodyOverride,
        status: 'pending',
      })),
    );
  }

  await recordAudit(session, 'post_recycled', 'ads_post', clone!.id, { from: id });
  return NextResponse.json({ id: clone!.id }, { status: 201 });
}
