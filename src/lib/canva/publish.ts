import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  SOCIAL_PLATFORMS,
  adsMedia,
  adsPostTargets,
  adsPosts,
  adsSocialAccounts,
  canvaContentItems,
  canvaExports,
  canvaPublishJobs,
  getDb,
} from '@/db';
import type { SocialPlatform } from '@/db';
import type { Session } from '@/lib/auth';
import { isAdmin } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { blockingProblems } from '@/lib/social/validate';
import { publishPostNow } from '@/lib/publisher';
import { canvaApiUrl, getValidAccessToken } from './oauth';
import { getCanvaSettings } from './settings';
import { getCanvaContentItem, type CanvaContentRow } from './sync';

export type MoveStatus = 'moved' | 'not_needed' | 'failed';

const isPlatform = (p: string): p is SocialPlatform => (SOCIAL_PLATFORMS as readonly string[]).includes(p);

/** Newest prepared (exported) asset URL for a design, or null if it was never prepared. */
async function resolvePreparedMedia(designId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ url: adsMedia.url })
    .from(canvaExports)
    .innerJoin(adsMedia, eq(adsMedia.id, canvaExports.mediaId))
    .where(and(eq(canvaExports.canvaDesignId, designId), eq(canvaExports.status, 'completed')))
    .orderBy(desc(canvaExports.completedAt))
    .limit(1);
  return row?.url ?? null;
}

/**
 * Move a design from the Ready folder into the Published folder in Canva. Idempotent: a design that
 * is already only in Published needs no move. If Canva reports the item is in multiple folders the
 * move is left failed (and retryable) rather than guessing which copy to move.
 */
export async function moveDesignToPublished(contentItemId: string | null, designId: string): Promise<{ status: MoveStatus; error?: string }> {
  const settings = await getCanvaSettings();
  if (!settings.publishedFolderId) return { status: 'not_needed', error: 'No Published folder is mapped.' };

  const item = contentItemId ? await getCanvaContentItem(contentItemId) : null;
  if (item && item.stages.length === 1 && item.stages[0] === 'published') return { status: 'not_needed' };

  const tok = await getValidAccessToken();
  if ('error' in tok) return { status: 'failed', error: tok.error };

  try {
    const res = await fetch(`${canvaApiUrl()}/folders/move`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_folder_id: settings.publishedFolderId, item_id: designId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string; message?: string };
      const code = `${data.code ?? data.error ?? ''}`;
      if (code.includes('multiple_folders')) {
        return { status: 'failed', error: 'Design is in more than one Canva folder — move it manually or retry.' };
      }
      return { status: 'failed', error: `Canva move failed (HTTP ${res.status}).` };
    }
    if (item) {
      await getDb()
        .update(canvaContentItems)
        .set({ stage: 'published', stages: ['published'], updatedAt: new Date() })
        .where(eq(canvaContentItems.id, item.id));
    }
    return { status: 'moved' };
  } catch (err) {
    return { status: 'failed', error: (err as Error).message.slice(0, 300) };
  }
}

/** Set the job's rollup + attempt the folder move, but only when the post fully published. */
async function finalizeJob(jobId: string, contentItemId: string | null, designId: string, postStatus: string): Promise<{ status: string; moveStatus: string; moveError: string | null }> {
  let jobStatus = postStatus;
  let moveStatus = 'skipped';
  let moveError: string | null = null;

  if (postStatus === 'published') {
    jobStatus = 'published';
    const mv = await moveDesignToPublished(contentItemId, designId);
    moveStatus = mv.status;
    moveError = mv.error ?? null;
  }

  const done = jobStatus === 'published' && (moveStatus === 'moved' || moveStatus === 'not_needed');
  await getDb()
    .update(canvaPublishJobs)
    .set({ status: jobStatus, moveStatus, moveError, completedAt: done ? new Date() : null, updatedAt: new Date() })
    .where(eq(canvaPublishJobs.id, jobId));
  return { status: jobStatus, moveStatus, moveError };
}

export interface PublishOptions {
  accountIds?: string[];
  manualPlatforms?: string[];
  body?: string;
  linkUrl?: string | null;
}

export interface PublishOutcome {
  ok: true;
  jobId: string;
  postId: string;
  status: string;
  moveStatus: string;
  moveError?: string;
  needsApproval?: boolean;
  notice?: string;
}
export interface PublishFailure {
  ok: false;
  error: string;
}

/**
 * Publish a prepared Canva design through the normal post pipeline and, on a fully-successful
 * publish, move the design from Ready to Published. The design must have been prepared (exported)
 * first so there is a stored image to attach.
 */
export async function publishCanvaDesign(item: CanvaContentRow, opts: PublishOptions, session: Session): Promise<PublishOutcome | PublishFailure> {
  const mediaUrl = await resolvePreparedMedia(item.canvaDesignId);
  if (!mediaUrl) return { ok: false, error: 'Prepare this design for the composer before publishing.' };

  const accountIds = [...new Set(opts.accountIds ?? [])];
  const manualPlatforms = [...new Set(opts.manualPlatforms ?? [])].filter(isPlatform);
  if (accountIds.length === 0 && manualPlatforms.length === 0) return { ok: false, error: 'Pick at least one target.' };

  const db = getDb();
  const accounts = accountIds.length
    ? await db.select().from(adsSocialAccounts).where(inArray(adsSocialAccounts.id, accountIds))
    : [];
  if (accounts.length !== accountIds.length) return { ok: false, error: 'One or more selected accounts no longer exist.' };
  const bad = accounts.find((a) => a.status !== 'connected');
  if (bad) return { ok: false, error: `${bad.displayName} is ${bad.status} — reconnect it first.` };

  const body = opts.body?.trim() ?? '';
  const linkUrl = opts.linkUrl?.trim() || null;
  const draft = { body, linkUrl, imageUrl: mediaUrl, videoUrl: null, title: null };
  const problems = [
    ...accounts.flatMap((a) => blockingProblems(draft, a.platform as SocialPlatform)),
    ...manualPlatforms.flatMap((p) => blockingProblems(draft, p)),
  ];
  if (problems.length) return { ok: false, error: problems.join(' · ') };

  const settings = await getSettings();
  const needsApproval = settings.requireApproval && !isAdmin(session);

  const [post] = await db
    .insert(adsPosts)
    .values({
      body,
      linkUrl,
      imageUrl: mediaUrl,
      imageUrls: [mediaUrl],
      status: 'scheduled',
      approvalStatus: needsApproval ? 'pending' : 'approved',
      scheduledAt: new Date(),
      createdBy: session.email,
    })
    .returning();

  await db.insert(adsPostTargets).values([
    ...accounts.map((a) => ({ postId: post!.id, accountId: a.id, platform: a.platform, status: 'pending' as const })),
    ...manualPlatforms.map((p) => ({ postId: post!.id, accountId: null, platform: p, status: 'manual' as const })),
  ]);

  const [job] = await db
    .insert(canvaPublishJobs)
    .values({
      canvaContentItemId: item.id,
      canvaDesignId: item.canvaDesignId,
      postId: post!.id,
      status: 'publishing',
      moveStatus: 'pending',
      requestedBy: session.email,
    })
    .returning();

  if (needsApproval) {
    await db.update(canvaPublishJobs).set({ status: 'awaiting_approval', moveStatus: 'skipped', updatedAt: new Date() }).where(eq(canvaPublishJobs.id, job!.id));
    return {
      ok: true,
      jobId: job!.id,
      postId: post!.id,
      status: 'awaiting_approval',
      moveStatus: 'skipped',
      needsApproval: true,
      notice: 'Sent for approval — it will publish once an admin approves it (the design moves to Published only after every target publishes).',
    };
  }

  const postStatus = await publishPostNow(post!.id);
  const fin = await finalizeJob(job!.id, item.id, item.canvaDesignId, postStatus);
  return { ok: true, jobId: job!.id, postId: post!.id, status: fin.status, moveStatus: fin.moveStatus, moveError: fin.moveError ?? undefined };
}

export type PublishJobRow = typeof canvaPublishJobs.$inferSelect;

/** Retry the failed targets of a job's post, then re-evaluate the folder move. */
export async function retryPublishJob(jobId: string): Promise<PublishOutcome | PublishFailure> {
  const db = getDb();
  const [job] = await db.select().from(canvaPublishJobs).where(eq(canvaPublishJobs.id, jobId)).limit(1);
  if (!job) return { ok: false, error: 'Publish job not found.' };
  if (!job.postId) return { ok: false, error: 'This job has no linked post to retry.' };

  let postStatus: string;
  try {
    postStatus = await publishPostNow(job.postId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const fin = await finalizeJob(job.id, job.canvaContentItemId, job.canvaDesignId, postStatus);
  return { ok: true, jobId: job.id, postId: job.postId, status: fin.status, moveStatus: fin.moveStatus, moveError: fin.moveError ?? undefined };
}

/** Retry only the Ready → Published move (the post already fully published, the move didn't stick). */
export async function retryMove(jobId: string): Promise<PublishOutcome | PublishFailure> {
  const db = getDb();
  const [job] = await db.select().from(canvaPublishJobs).where(eq(canvaPublishJobs.id, jobId)).limit(1);
  if (!job) return { ok: false, error: 'Publish job not found.' };
  if (job.status !== 'published') return { ok: false, error: 'The post is not fully published yet — retry publishing first.' };

  const mv = await moveDesignToPublished(job.canvaContentItemId, job.canvaDesignId);
  const done = mv.status === 'moved' || mv.status === 'not_needed';
  await db
    .update(canvaPublishJobs)
    .set({ moveStatus: mv.status, moveError: mv.error ?? null, completedAt: done ? new Date() : null, updatedAt: new Date() })
    .where(eq(canvaPublishJobs.id, job.id));
  return { ok: true, jobId: job.id, postId: job.postId ?? '', status: job.status, moveStatus: mv.status, moveError: mv.error };
}

/** Recent publish jobs, newest first, for the library status view. */
export async function listPublishJobs(designId?: string): Promise<PublishJobRow[]> {
  const db = getDb();
  const where = designId ? eq(canvaPublishJobs.canvaDesignId, designId) : undefined;
  const q = db.select().from(canvaPublishJobs);
  const rows = where ? await q.where(where).orderBy(desc(canvaPublishJobs.createdAt)).limit(50) : await q.orderBy(desc(canvaPublishJobs.createdAt)).limit(50);
  return rows;
}
