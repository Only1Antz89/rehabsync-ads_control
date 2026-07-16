import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { canvaConfigured, getConnection } from '@/lib/canva/oauth';
import { getCanvaSettings } from '@/lib/canva/settings';

export const dynamic = 'force-dynamic';

/** Canva connection status + folder mapping, for the settings screen (admin only). */
export async function GET() {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const [conn, settings] = await Promise.all([getConnection(), getCanvaSettings()]);
  return NextResponse.json({
    configured: canvaConfigured(),
    connection: {
      status: conn.status,
      scopes: conn.scopes,
      connectedBy: conn.connectedBy,
      lastError: conn.lastError,
      updatedAt: conn.updatedAt,
    },
    settings: {
      draftsFolderId: settings.draftsFolderId,
      draftsFolderName: settings.draftsFolderName,
      readyFolderId: settings.readyFolderId,
      readyFolderName: settings.readyFolderName,
      publishedFolderId: settings.publishedFolderId,
      publishedFolderName: settings.publishedFolderName,
      lastValidatedAt: settings.lastValidatedAt,
    },
  });
}
