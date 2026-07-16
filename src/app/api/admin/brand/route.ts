import { NextResponse } from 'next/server';
import { isResponse, requireAdmin, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { getBrandKit, setBrandKit } from '@/lib/brand';

export const dynamic = 'force-dynamic';

/** Read the brand kit (any signed-in user — the composer needs it). */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  return NextResponse.json({ brand: await getBrandKit() });
}

/** Update the brand kit (admin only). */
export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const brand = await setBrandKit(
    {
      primaryColor: typeof body?.primaryColor === 'string' ? body.primaryColor : undefined,
      secondaryColor: typeof body?.secondaryColor === 'string' ? body.secondaryColor : undefined,
      logoUrl: typeof body?.logoUrl === 'string' ? body.logoUrl : undefined,
      voice: typeof body?.voice === 'string' ? body.voice : undefined,
      boilerplate: typeof body?.boilerplate === 'string' ? body.boilerplate : undefined,
      hashtags: Array.isArray(body?.hashtags) ? (body.hashtags as unknown[]).filter((t): t is string => typeof t === 'string') : undefined,
    },
    session.email,
  );
  await recordAudit(session, 'brand_kit_updated', 'ads_brand_kit', null, {});
  return NextResponse.json({ brand });
}
