import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsMedia, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';

type Params = { params: Promise<{ id: string }> };

/** Remove an asset from the library (leaves the stored object; just drops the library entry). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const deleted = await getDb().delete(adsMedia).where(eq(adsMedia.id, id)).returning({ id: adsMedia.id });
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
