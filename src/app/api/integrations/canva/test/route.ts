import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { getValidAccessToken } from '@/lib/canva/oauth';
import { folderAccessible } from '@/lib/canva/folders';
import { getCanvaSettings, markValidated } from '@/lib/canva/settings';

/** Test the Canva connection and that each configured folder is reachable. Admin only. */
export async function POST() {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const tok = await getValidAccessToken();
  if ('error' in tok) return NextResponse.json({ ok: false, connection: false, error: tok.error }, { status: 200 });

  const settings = await getCanvaSettings();
  const stages: { stage: string; id: string | null }[] = [
    { stage: 'drafts', id: settings.draftsFolderId },
    { stage: 'ready', id: settings.readyFolderId },
    { stage: 'published', id: settings.publishedFolderId },
  ];
  const results: { stage: string; ok: boolean }[] = [];
  for (const s of stages) {
    if (!s.id) continue;
    results.push({ stage: s.stage, ok: await folderAccessible(s.id) });
  }
  const allOk = results.length > 0 && results.every((r) => r.ok);
  if (allOk) await markValidated();
  return NextResponse.json({ ok: allOk, connection: true, results });
}
