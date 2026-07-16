import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsContentSnippets, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

/** Delete a caption snippet. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  await getDb().delete(adsContentSnippets).where(eq(adsContentSnippets.id, id));
  await recordAudit(session, 'content_snippet_deleted', 'ads_content_snippet', id, {});
  return NextResponse.json({ ok: true });
}
