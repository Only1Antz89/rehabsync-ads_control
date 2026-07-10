import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';
import { isResponse, requireSession } from '@/lib/route-auth';
import { createSignedUpload, objectPath, storageConfigured } from '@/lib/storage';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * Sign a direct-to-Supabase upload for post media. The browser PUTs the file to the returned
 * `uploadUrl` itself (media never flows through this function), then uses `publicUrl` in the
 * composer. Size is validated here and enforced again by the platform relays at publish time.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  if (!storageConfigured()) {
    return NextResponse.json(
      { error: 'Media storage is not configured — paste a hosted URL instead.' },
      { status: 501 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
    size?: number;
  } | null;
  const filename = body?.filename?.trim() ?? '';
  const contentType = body?.contentType?.trim().toLowerCase() ?? '';
  const size = Number(body?.size ?? 0);
  if (!filename || !contentType || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'filename, contentType and size are required.' }, { status: 400 });
  }

  const kind = IMAGE_TYPES.has(contentType) ? 'image' : VIDEO_TYPES.has(contentType) ? 'video' : null;
  if (!kind) {
    return NextResponse.json(
      { error: 'Unsupported type — images (jpeg/png/webp/gif) or video (mp4/mov/webm) only.' },
      { status: 400 },
    );
  }
  const cap = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (size > cap) {
    return NextResponse.json(
      { error: `File too large — ${kind} uploads cap at ${Math.round(cap / 1024 / 1024)} MB.` },
      { status: 400 },
    );
  }

  try {
    const signed = await createSignedUpload(objectPath(kind, filename));
    await recordAudit(session, 'media_upload_signed', 'ads_media', null, {
      path: signed.path,
      contentType,
      size,
    });
    return NextResponse.json({ uploadUrl: signed.uploadUrl, publicUrl: signed.publicUrl, kind });
  } catch (err) {
    console.error('[media/sign] failed', err);
    return NextResponse.json({ error: 'Could not prepare the upload — try again.' }, { status: 502 });
  }
}
