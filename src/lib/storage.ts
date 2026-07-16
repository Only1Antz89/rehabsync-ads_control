/**
 * Supabase Storage (`ads-media` bucket) via the REST API with the service key.
 *
 * Uploads use SIGNED upload URLs: the server signs, the browser PUTs the file straight to
 * Supabase — media never flows through a Vercel function (whose request bodies cap at ~4.5 MB).
 * The bucket must exist and be public-read; see DEPLOYMENT.md.
 */
import { randomBytes } from 'node:crypto';

const BUCKET = 'ads-media';

function baseUrl(): string {
  return (process.env['REHABSYNC_SUPABASE_URL'] ?? '').replace(/\/+$/, '');
}

function serviceKey(): string {
  return process.env['REHABSYNC_SUPABASE_SERVICE_KEY'] ?? '';
}

export function storageConfigured(): boolean {
  return Boolean(baseUrl() && serviceKey());
}

/** Lowercased, extension-preserving, path-safe filename (never empty). */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80);
  return cleaned || 'file';
}

/** `image/2026/07/<random>-<name>` — random prefix prevents guessing and collisions. */
export function objectPath(kind: 'image' | 'video', filename: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${kind}/${yyyy}/${mm}/${randomBytes(8).toString('hex')}-${sanitizeFilename(filename)}`;
}

export interface SignedUpload {
  /** PUT the file bytes here (Content-Type header set to the file's type). */
  uploadUrl: string;
  /** Where the object is served from once uploaded (public bucket). */
  publicUrl: string;
  path: string;
}

/** Create a signed upload URL for one object. */
export async function createSignedUpload(path: string): Promise<SignedUpload> {
  if (!storageConfigured()) throw new Error('Media storage is not configured');
  const res = await fetch(`${baseUrl()}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => null)) as { url?: string; message?: string } | null;
  if (!res.ok || !data?.url) {
    throw new Error(`Storage sign: ${data?.message ?? `HTTP ${res.status}`}`);
  }
  const uploadUrl = data.url.startsWith('http') ? data.url : `${baseUrl()}/storage/v1${data.url}`;
  return {
    uploadUrl,
    publicUrl: `${baseUrl()}/storage/v1/object/public/${BUCKET}/${path}`,
    path,
  };
}

/**
 * Server-side upload: sign an upload URL then PUT the bytes straight to storage. Used when the
 * server itself has the file (e.g. an asset rendered by Canva that we download and persist), rather
 * than the browser. Returns the public URL the object is served from.
 */
export async function uploadServerObject(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const signed = await createSignedUpload(path);
  const res = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes as unknown as BodyInit,
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Storage upload failed: HTTP ${res.status} ${msg.slice(0, 200)}`);
  }
  return signed.publicUrl;
}
