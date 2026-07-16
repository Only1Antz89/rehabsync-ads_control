import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { browseFolders } from '@/lib/canva/folders';

export const dynamic = 'force-dynamic';

/** Browse Canva sub-folders (from root by default) for the folder picker. Admin only. */
export async function GET(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const parent = new URL(req.url).searchParams.get('parent') || 'root';
  const result = await browseFolders(parent);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ parent, folders: result.items });
}
