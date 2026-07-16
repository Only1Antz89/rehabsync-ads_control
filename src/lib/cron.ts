import { eq } from 'drizzle-orm';
import { adsCronJobs, getDb } from '@/db';
import { publishDuePosts } from './publisher';
import { processNewsletters } from './newsletters';
import { syncMetrics } from './metrics';
import { syncIngestion } from './ingestion';
import { syncCanvaContent } from './canva/sync';

export interface CronJobMeta {
  key: string;
  label: string;
  description: string;
}

/** The scheduled jobs this app exposes. Keys match rows seeded in migration 0006. */
export const CRON_JOBS: CronJobMeta[] = [
  { key: 'publish', label: 'Publish scheduled posts', description: 'Publish social posts whose scheduled time has arrived.' },
  { key: 'newsletters', label: 'Send newsletters', description: 'Send the next batch of due newsletter emails.' },
  { key: 'metrics', label: 'Sync metrics', description: 'Snapshot engagement + follower counts from connected networks (heaviest job).' },
  { key: 'ingest', label: 'Ingest comments', description: 'Pull new audience comments from connected networks into the inbox.' },
  { key: 'canva-sync', label: 'Sync Canva designs', description: 'Refresh the design library from the mapped Canva Drafts / Ready / Published folders.' },
];

const RUNNERS: Record<string, () => Promise<Record<string, unknown>>> = {
  publish: async () => publishDuePosts(),
  newsletters: async () => processNewsletters(),
  metrics: async () => syncMetrics(),
  ingest: async () => syncIngestion(),
  'canva-sync': async () => ({ ...(await syncCanvaContent()) }),
};

export function isKnownJob(key: string): key is string {
  return Object.prototype.hasOwnProperty.call(RUNNERS, key);
}

type JobRow = typeof adsCronJobs.$inferSelect;

async function ensureRow(key: string): Promise<JobRow | null> {
  const db = getDb();
  const [existing] = await db.select().from(adsCronJobs).where(eq(adsCronJobs.key, key)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(adsCronJobs)
    .values({ key })
    .onConflictDoNothing({ target: adsCronJobs.key })
    .returning();
  if (created) return created;
  const [row] = await db.select().from(adsCronJobs).where(eq(adsCronJobs.key, key)).limit(1);
  return row ?? null;
}

/** Jobs with their live state, for the admin console. Seeds any missing rows. */
export async function listCronJobs(): Promise<(CronJobMeta & { enabled: boolean; lastRunAt: Date | null; lastStatus: string | null; lastDetail: Record<string, unknown> | null })[]> {
  const out = [];
  for (const meta of CRON_JOBS) {
    const row = await ensureRow(meta.key);
    out.push({
      ...meta,
      enabled: row?.enabled ?? true,
      lastRunAt: row?.lastRunAt ?? null,
      lastStatus: row?.lastStatus ?? null,
      lastDetail: row?.lastDetail ?? null,
    });
  }
  return out;
}

export async function setCronEnabled(key: string, enabled: boolean, actorEmail: string): Promise<boolean> {
  if (!isKnownJob(key)) return false;
  await ensureRow(key);
  await getDb()
    .update(adsCronJobs)
    .set({ enabled, updatedBy: actorEmail, updatedAt: new Date() })
    .where(eq(adsCronJobs.key, key));
  return true;
}

/** Run a job now and record the outcome. Ignores the enabled flag (used by the manual admin trigger). */
export async function runJob(key: string): Promise<{ ok: boolean; detail?: Record<string, unknown>; error?: string }> {
  const runner = RUNNERS[key];
  if (!runner) return { ok: false, error: 'Unknown job.' };
  const db = getDb();
  await ensureRow(key);
  try {
    const detail = await runner();
    await db
      .update(adsCronJobs)
      .set({ lastRunAt: new Date(), lastStatus: 'ok', lastDetail: detail, updatedAt: new Date() })
      .where(eq(adsCronJobs.key, key));
    return { ok: true, detail };
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await db
      .update(adsCronJobs)
      .set({ lastRunAt: new Date(), lastStatus: 'error', lastDetail: { error: message }, updatedAt: new Date() })
      .where(eq(adsCronJobs.key, key));
    return { ok: false, error: message };
  }
}

/**
 * Cron-endpoint entry point: skips (records `skipped`) when the job is disabled in the admin
 * console, otherwise runs it. This is the controller that lets automation be paused centrally.
 */
export async function guardedRun(key: string): Promise<Record<string, unknown>> {
  if (!isKnownJob(key)) return { ok: false, error: 'Unknown job.' };
  const row = await ensureRow(key);
  if (row && !row.enabled) {
    await getDb()
      .update(adsCronJobs)
      .set({ lastRunAt: new Date(), lastStatus: 'skipped', updatedAt: new Date() })
      .where(eq(adsCronJobs.key, key));
    return { ok: true, skipped: true, disabled: true };
  }
  const res = await runJob(key);
  return res.ok ? { ok: true, ...(res.detail ?? {}) } : { ok: false, error: res.error };
}
