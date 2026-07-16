import { and, desc, eq, inArray } from 'drizzle-orm';
import { canvaContentItems, getDb } from '@/db';
import type { CanvaStage } from '@/db/schema';
import { getCanvaSettings } from './settings';
import { listFolderItems } from './folders';

const STAGE_PRIORITY: Record<CanvaStage, number> = { drafts: 0, ready: 1, published: 2 };

export interface SyncResult {
  ok: boolean;
  synced: number;
  removed: number;
  perStage: Record<CanvaStage, number>;
  error?: string;
  /** Stages whose folder is mapped but could not be read this run (skipped from removal sweep). */
  failedStages: CanvaStage[];
}

function stageFolders(settings: Awaited<ReturnType<typeof getCanvaSettings>>): { stage: CanvaStage; folderId: string | null }[] {
  return [
    { stage: 'drafts', folderId: settings.draftsFolderId },
    { stage: 'ready', folderId: settings.readyFolderId },
    { stage: 'published', folderId: settings.publishedFolderId },
  ];
}

/**
 * Pull designs from every mapped folder and upsert them into `canva_content_items`. A design found
 * in more than one mapped folder is recorded once, with `stage` = the furthest-along folder and
 * `stages` = all folders it appears in. Designs that vanished from every mapped folder are marked
 * `removed` — but only when the whole scan succeeded, so a transient Canva error never wipes the
 * library.
 */
export async function syncCanvaContent(): Promise<SyncResult> {
  const settings = await getCanvaSettings();
  const mapped = stageFolders(settings).filter((s): s is { stage: CanvaStage; folderId: string } => Boolean(s.folderId));
  const perStage: Record<CanvaStage, number> = { drafts: 0, ready: 0, published: 0 };
  if (mapped.length === 0) {
    return { ok: false, synced: 0, removed: 0, perStage, failedStages: [], error: 'No Canva folders are mapped yet.' };
  }

  const seen = new Map<string, { stages: Set<CanvaStage>; title: string; thumb: string | null }>();
  const failedStages: CanvaStage[] = [];

  for (const { stage, folderId } of mapped) {
    const res = await listFolderItems(folderId, ['design']);
    if ('error' in res) {
      failedStages.push(stage);
      continue;
    }
    for (const item of res.items) {
      if (item.kind !== 'design') continue;
      const cur = seen.get(item.id) ?? { stages: new Set<CanvaStage>(), title: item.name, thumb: item.thumbnailUrl };
      cur.stages.add(stage);
      cur.title = item.name;
      if (item.thumbnailUrl) cur.thumb = item.thumbnailUrl;
      seen.set(item.id, cur);
      perStage[stage] += 1;
    }
  }

  const db = getDb();
  const now = new Date();
  let synced = 0;
  for (const [designId, info] of seen) {
    const stages = [...info.stages].sort((a, b) => STAGE_PRIORITY[a] - STAGE_PRIORITY[b]);
    const primary = stages[stages.length - 1]!;
    await db
      .insert(canvaContentItems)
      .values({
        canvaDesignId: designId,
        stage: primary,
        stages,
        title: info.title.slice(0, 500),
        thumbnailUrl: info.thumb,
        status: 'active',
        lastSyncedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: canvaContentItems.canvaDesignId,
        set: {
          stage: primary,
          stages,
          title: info.title.slice(0, 500),
          thumbnailUrl: info.thumb,
          status: 'active',
          lastSyncedAt: now,
          updatedAt: now,
        },
      });
    synced += 1;
  }

  // Removal sweep — only when every mapped folder was read successfully.
  let removed = 0;
  if (failedStages.length === 0) {
    const active = await db
      .select({ id: canvaContentItems.id, designId: canvaContentItems.canvaDesignId })
      .from(canvaContentItems)
      .where(eq(canvaContentItems.status, 'active'));
    const gone = active.filter((r) => !seen.has(r.designId)).map((r) => r.id);
    if (gone.length > 0) {
      await db
        .update(canvaContentItems)
        .set({ status: 'removed', updatedAt: now })
        .where(inArray(canvaContentItems.id, gone));
      removed = gone.length;
    }
  }

  return { ok: failedStages.length === 0, synced, removed, perStage, failedStages };
}

export type CanvaContentRow = typeof canvaContentItems.$inferSelect;

/** List active synced designs, optionally filtered to one stage, newest sync first. */
export async function listCanvaContent(stage?: CanvaStage): Promise<CanvaContentRow[]> {
  const db = getDb();
  const where = stage
    ? and(eq(canvaContentItems.status, 'active'), eq(canvaContentItems.stage, stage))
    : eq(canvaContentItems.status, 'active');
  return db.select().from(canvaContentItems).where(where).orderBy(desc(canvaContentItems.lastSyncedAt));
}

export async function getCanvaContentItem(id: string): Promise<CanvaContentRow | null> {
  const [row] = await getDb().select().from(canvaContentItems).where(eq(canvaContentItems.id, id)).limit(1);
  return row ?? null;
}
