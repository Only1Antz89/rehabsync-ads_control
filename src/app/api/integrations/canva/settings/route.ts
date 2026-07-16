import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { saveCanvaSettings } from '@/lib/canva/settings';

/** Save the Drafts / Ready / Published folder mapping. Admin only. */
export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as Record<string, string | null> | null;
  const result = await saveCanvaSettings(
    {
      draftsFolderId: body?.['draftsFolderId'] ?? null,
      draftsFolderName: body?.['draftsFolderName'] ?? null,
      readyFolderId: body?.['readyFolderId'] ?? null,
      readyFolderName: body?.['readyFolderName'] ?? null,
      publishedFolderId: body?.['publishedFolderId'] ?? null,
      publishedFolderName: body?.['publishedFolderName'] ?? null,
    },
    session.email,
  );
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  await recordAudit(session, 'canva_settings_saved', 'canva_settings', null, {});
  return NextResponse.json({ settings: result.settings });
}
