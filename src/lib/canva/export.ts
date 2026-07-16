import { createHash } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { adsMedia, canvaExports, getDb } from '@/db';
import { objectPath, sanitizeFilename, storageConfigured, uploadServerObject } from '@/lib/storage';
import { canvaApiUrl, getValidAccessToken } from './oauth';

const POLL_TRIES = 20;
const POLL_DELAY_MS = 1500;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB guard on a downloaded asset.

export interface ExportInput {
  contentItemId: string | null;
  designId: string;
  title?: string | null;
  format?: string;
}

export interface ExportResult {
  ok: true;
  exportId: string;
  mediaId: string;
  url: string;
  reused: boolean;
}
export interface ExportError {
  ok: false;
  error: string;
}

async function canvaFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${canvaApiUrl()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ExportJob {
  id?: string;
  status?: string;
  urls?: string[];
  error?: { message?: string } | string;
}

/** Create the export job → poll to completion → return the rendered asset URL(s). */
async function runCanvaExport(designId: string, format: string, token: string): Promise<{ jobId: string; urls: string[] } | { error: string }> {
  const createRes = await canvaFetch('/exports', token, {
    method: 'POST',
    body: JSON.stringify({ design_id: designId, format: { type: format } }),
  });
  if (!createRes.ok) return { error: `Canva export request failed (HTTP ${createRes.status}).` };
  const created = (await createRes.json().catch(() => ({}))) as { job?: ExportJob };
  const jobId = created.job?.id;
  if (!jobId) return { error: 'Canva did not return an export job id.' };

  let job: ExportJob = created.job ?? {};
  for (let i = 0; i < POLL_TRIES; i += 1) {
    if (job.status === 'success') break;
    if (job.status === 'failed') {
      const msg = typeof job.error === 'string' ? job.error : job.error?.message;
      return { error: `Canva export failed${msg ? `: ${msg}` : '.'}` };
    }
    await sleep(POLL_DELAY_MS);
    const pollRes = await canvaFetch(`/exports/${encodeURIComponent(jobId)}`, token);
    if (!pollRes.ok) return { error: `Canva export poll failed (HTTP ${pollRes.status}).` };
    job = ((await pollRes.json().catch(() => ({}))) as { job?: ExportJob }).job ?? {};
  }
  if (job.status !== 'success') return { error: 'Canva export timed out.' };
  const urls = Array.isArray(job.urls) ? job.urls.filter((u) => typeof u === 'string') : [];
  if (urls.length === 0) return { error: 'Canva export returned no downloadable asset.' };
  return { jobId, urls };
}

/**
 * Render a Canva design and persist it as a reusable media asset the composer can attach.
 * De-duplicated by content checksum: an identical re-export reuses the stored asset rather than
 * uploading again. Every run — success or failure — is recorded in canva_exports.
 */
export async function exportDesignToMedia(input: ExportInput, actorEmail: string): Promise<ExportResult | ExportError> {
  const format = (input.format ?? 'png').toLowerCase();
  if (!['png', 'jpg'].includes(format)) return { ok: false, error: 'Unsupported export format.' };
  if (!storageConfigured()) return { ok: false, error: 'Media storage is not configured on the server.' };

  const tok = await getValidAccessToken();
  if ('error' in tok) return { ok: false, error: `Canva connection: ${tok.error}` };

  const db = getDb();
  const [row] = await db
    .insert(canvaExports)
    .values({
      canvaContentItemId: input.contentItemId,
      canvaDesignId: input.designId,
      format,
      status: 'processing',
      requestedBy: actorEmail,
    })
    .returning();
  const exportId = row!.id;

  try {
    const job = await runCanvaExport(input.designId, format, tok.token);
    if ('error' in job) throw new Error(job.error);

    const assetRes = await fetch(job.urls[0]!, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!assetRes.ok) throw new Error(`Could not download the exported asset (HTTP ${assetRes.status}).`);
    const buf = new Uint8Array(await assetRes.arrayBuffer());
    if (buf.byteLength === 0) throw new Error('Exported asset was empty.');
    if (buf.byteLength > MAX_BYTES) throw new Error('Exported asset exceeds the size limit.');
    const contentType = assetRes.headers.get('content-type') || (format === 'jpg' ? 'image/jpeg' : 'image/png');
    const checksum = createHash('sha256').update(buf).digest('hex');

    // De-dupe: identical bytes already stored → reuse that media asset.
    const [dupe] = await db
      .select({ mediaId: canvaExports.mediaId })
      .from(canvaExports)
      .where(and(eq(canvaExports.checksum, checksum), eq(canvaExports.status, 'completed'), isNotNull(canvaExports.mediaId)))
      .limit(1);

    let mediaId: string;
    let url: string;
    let reused = false;
    if (dupe?.mediaId) {
      const [media] = await db.select().from(adsMedia).where(eq(adsMedia.id, dupe.mediaId)).limit(1);
      if (media) {
        mediaId = media.id;
        url = media.url;
        reused = true;
      } else {
        ({ mediaId, url } = await storeAsset(input, format, buf, contentType, actorEmail));
      }
    } else {
      ({ mediaId, url } = await storeAsset(input, format, buf, contentType, actorEmail));
    }

    await db
      .update(canvaExports)
      .set({
        jobId: job.jobId,
        status: 'completed',
        mediaId,
        checksum,
        sizeBytes: buf.byteLength,
        reused,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(canvaExports.id, exportId));

    return { ok: true, exportId, mediaId, url, reused };
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await db
      .update(canvaExports)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(eq(canvaExports.id, exportId));
    return { ok: false, error: message };
  }
}

async function storeAsset(
  input: ExportInput,
  format: string,
  bytes: Uint8Array,
  contentType: string,
  actorEmail: string,
): Promise<{ mediaId: string; url: string }> {
  const base = sanitizeFilename(input.title?.trim() || `canva-${input.designId}`);
  const filename = `${base}.${format}`;
  const url = await uploadServerObject(objectPath('image', filename), bytes, contentType);
  const db = getDb();
  const [media] = await db
    .insert(adsMedia)
    .values({ url, kind: 'image', filename: filename.slice(0, 255), sizeBytes: bytes.byteLength, uploadedBy: actorEmail })
    .onConflictDoUpdate({ target: adsMedia.url, set: { filename: filename.slice(0, 255) } })
    .returning();
  return { mediaId: media!.id, url };
}
