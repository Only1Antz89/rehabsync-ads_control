import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { listPublishJobs } from '@/lib/canva/publish';

export const dynamic = 'force-dynamic';

/** List recent Canva publish jobs (optionally for one design). Any authenticated staff. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const designId = new URL(req.url).searchParams.get('designId')?.trim() || undefined;
  const jobs = await listPublishJobs(designId);
  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      canvaDesignId: j.canvaDesignId,
      postId: j.postId,
      status: j.status,
      moveStatus: j.moveStatus,
      moveError: j.moveError,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
    })),
  });
}
