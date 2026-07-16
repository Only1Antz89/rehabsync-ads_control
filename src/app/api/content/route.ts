import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { adsContentSnippets, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** List reusable caption snippets. */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const snippets = await getDb()
    .select()
    .from(adsContentSnippets)
    .orderBy(desc(adsContentSnippets.createdAt))
    .limit(200);
  return NextResponse.json({ snippets });
}

/** Create a caption snippet. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { title?: string; body?: string; tags?: string[] } | null;
  const title = body?.title?.trim();
  const text = body?.body?.trim();
  if (!title || !text) return NextResponse.json({ error: 'Title and body are required.' }, { status: 400 });

  const [snippet] = await getDb()
    .insert(adsContentSnippets)
    .values({
      title: title.slice(0, 160),
      body: text,
      tags: (body?.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 20),
      createdBy: session.email,
    })
    .returning();

  await recordAudit(session, 'content_snippet_created', 'ads_content_snippet', snippet!.id, {});
  return NextResponse.json({ snippet }, { status: 201 });
}
