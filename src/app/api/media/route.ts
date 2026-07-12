import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { adsMedia, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

/** List saved media assets (optionally by kind) — the composer's library picker. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const kind = new URL(req.url).searchParams.get('kind')?.trim();

  const db = getDb();
  const rows = kind
    ? await db.select().from(adsMedia).where(eq(adsMedia.kind, kind)).orderBy(desc(adsMedia.createdAt)).limit(200)
    : await db.select().from(adsMedia).orderBy(desc(adsMedia.createdAt)).limit(200);
  return NextResponse.json({ media: rows });
}

/** Record an uploaded asset in the library (idempotent by URL). */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    url?: string;
    kind?: string;
    filename?: string;
    sizeBytes?: number;
  } | null;
  const url = body?.url?.trim();
  if (!url) return NextResponse.json({ error: 'url is required.' }, { status: 400 });
  const kind = body?.kind === 'video' ? 'video' : 'image';

  const [row] = await getDb()
    .insert(adsMedia)
    .values({
      url,
      kind,
      filename: body?.filename?.slice(0, 255) ?? null,
      sizeBytes: typeof body?.sizeBytes === 'number' && Number.isFinite(body.sizeBytes) ? Math.round(body.sizeBytes) : null,
      uploadedBy: session.email,
    })
    .onConflictDoNothing({ target: adsMedia.url })
    .returning();
  return NextResponse.json({ ok: true, media: row ?? null }, { status: 201 });
}
