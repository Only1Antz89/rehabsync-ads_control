import { NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { SOCIAL_PLATFORMS, adsPostTargets, adsPosts, adsSocialAccounts, getDb } from '@/db';
import type { SocialPlatform } from '@/db';
import { isAdmin } from '@/lib/auth';
import { isResponse, requireSession } from '@/lib/route-auth';
import { getSettings } from '@/lib/settings';
import { blockingProblems, PLATFORM_RULES } from '@/lib/social/validate';
import { publishPostNow } from '@/lib/publisher';
import { nextQueueSlot } from '@/lib/queue';
import { recordAudit } from '@/lib/audit';

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const db = getDb();

  const posts = await db.select().from(adsPosts).orderBy(desc(adsPosts.updatedAt)).limit(200);
  const ids = posts.map((p) => p.id);
  const targets = ids.length
    ? await db
        .select({
          id: adsPostTargets.id,
          postId: adsPostTargets.postId,
          accountId: adsPostTargets.accountId,
          platform: adsPostTargets.platform,
          status: adsPostTargets.status,
          platformUrl: adsPostTargets.platformUrl,
          error: adsPostTargets.error,
          accountName: adsSocialAccounts.displayName,
        })
        .from(adsPostTargets)
        .leftJoin(adsSocialAccounts, eq(adsSocialAccounts.id, adsPostTargets.accountId))
        .where(inArray(adsPostTargets.postId, ids))
    : [];

  return NextResponse.json({
    posts: posts.map((post) => ({
      ...post,
      targets: targets.filter((t) => t.postId === post.id),
    })),
  });
}

interface CreateBody {
  body?: string;
  linkUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  title?: string | null;
  accountIds?: string[];
  manualPlatforms?: string[];
  scheduledAt?: string | null;
  publishNow?: boolean;
  addToQueue?: boolean;
  // Per-network caption overrides, keyed by account id (API targets) or platform (manual targets).
  overrides?: Record<string, string>;
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const db = getDb();

  const input = ((await req.json().catch(() => null)) ?? {}) as CreateBody;
  const body = input.body?.trim() ?? '';
  const accountIds = [...new Set(input.accountIds ?? [])];
  const manualPlatforms = [...new Set(input.manualPlatforms ?? [])].filter((p): p is SocialPlatform =>
    (SOCIAL_PLATFORMS as readonly string[]).includes(p),
  );

  if (accountIds.length === 0 && manualPlatforms.length === 0) {
    return NextResponse.json({ error: 'Pick at least one target' }, { status: 400 });
  }

  const accounts = accountIds.length
    ? await db
        .select()
        .from(adsSocialAccounts)
        .where(inArray(adsSocialAccounts.id, accountIds))
    : [];
  if (accounts.length !== accountIds.length) {
    return NextResponse.json({ error: 'One or more selected accounts no longer exist' }, { status: 400 });
  }
  const disconnected = accounts.find((a) => a.status !== 'connected');
  if (disconnected) {
    return NextResponse.json(
      { error: `${disconnected.displayName} is ${disconnected.status} — reconnect it first` },
      { status: 400 },
    );
  }

  // Validate the draft against every selected platform; blocking problems reject the request.
  const draft = {
    body,
    linkUrl: input.linkUrl,
    imageUrl: input.imageUrl,
    videoUrl: input.videoUrl,
    title: input.title,
  };
  const problems = [
    ...accounts.flatMap((a) => blockingProblems(draft, a.platform as SocialPlatform)),
    ...manualPlatforms.flatMap((p) => blockingProblems(draft, p)),
  ];
  if (problems.length) {
    return NextResponse.json({ error: problems.join(' · ') }, { status: 400 });
  }

  // "Add to queue" resolves the next free posting slot; otherwise use the explicit schedule.
  let scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (input.addToQueue && !input.publishNow) {
    const slot = await nextQueueSlot();
    if (!slot) {
      return NextResponse.json(
        { error: 'No posting-queue slots configured — add some under Posting queue first.' },
        { status: 400 },
      );
    }
    scheduledAt = slot;
  }
  const wantsSchedule = Boolean(scheduledAt) && !input.publishNow;
  const status = input.publishNow ? 'scheduled' : wantsSchedule ? 'scheduled' : 'draft';

  // Approval workflow: when the toggle is on, posts by the `user` role wait for an admin.
  const settings = await getSettings();
  const needsApproval = settings.requireApproval && !isAdmin(session);

  const [post] = await db
    .insert(adsPosts)
    .values({
      body,
      linkUrl: input.linkUrl?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      videoUrl: input.videoUrl?.trim() || null,
      title: input.title?.trim() || null,
      status,
      approvalStatus: needsApproval ? 'pending' : 'approved',
      scheduledAt: input.publishNow ? new Date() : scheduledAt,
      createdBy: session.email,
    })
    .returning();

  // Per-network caption override; only stored when it actually differs from the base body.
  const overrideFor = (key: string): string | null => {
    const t = input.overrides?.[key]?.trim();
    return t && t !== body ? t.slice(0, 5000) : null;
  };

  await db.insert(adsPostTargets).values([
    ...accounts.map((account) => ({
      postId: post!.id,
      accountId: account.id,
      platform: account.platform,
      bodyOverride: overrideFor(account.id),
      status: 'pending' as const,
    })),
    ...manualPlatforms
      // API platforms picked without a connected account still go through manual-export.
      .map((platform) => ({
        postId: post!.id,
        accountId: null,
        platform,
        bodyOverride: overrideFor(platform),
        status: 'manual' as const,
      })),
  ]);

  await recordAudit(session, 'post_created', 'ads_post', post!.id, {
    status,
    approvalStatus: needsApproval ? 'pending' : 'approved',
    targets: accounts.length + manualPlatforms.length,
    apiPublishable: accounts.filter((a) => PLATFORM_RULES[a.platform as SocialPlatform].apiPublishing).length,
  });

  if (input.publishNow) {
    if (needsApproval) {
      // Queued instead of published — it goes out the moment an admin approves.
      return NextResponse.json(
        { post, notice: 'Sent for approval — it will publish once an admin approves it.' },
        { status: 201 },
      );
    }
    const finalStatus = await publishPostNow(post!.id);
    return NextResponse.json({ post: { ...post, status: finalStatus } }, { status: 201 });
  }
  const queuedNotice =
    input.addToQueue && scheduledAt
      ? `Added to the queue — publishes ${scheduledAt.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC.`
      : undefined;
  return NextResponse.json({ post, notice: queuedNotice }, { status: 201 });
}
