import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { getSettings, updateSettings } from '@/lib/settings';

export async function GET() {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  return NextResponse.json({ settings: await getSettings() });
}

/** Update tool settings: approval toggle, UTM defaults, timezone. */
export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    requireApproval?: boolean;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    timezone?: string;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  if (body.timezone !== undefined && body.timezone.trim()) {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: body.timezone.trim() });
    } catch {
      return NextResponse.json({ error: 'Unknown timezone.' }, { status: 400 });
    }
  }

  const settings = await updateSettings(
    {
      ...(typeof body.requireApproval === 'boolean' ? { requireApproval: body.requireApproval } : {}),
      ...(typeof body.utmSource === 'string' ? { utmSource: body.utmSource } : {}),
      ...(typeof body.utmMedium === 'string' ? { utmMedium: body.utmMedium } : {}),
      ...(typeof body.utmCampaign === 'string' ? { utmCampaign: body.utmCampaign } : {}),
      ...(typeof body.timezone === 'string' && body.timezone.trim() ? { timezone: body.timezone } : {}),
    },
    session.email,
  );
  await recordAudit(session, 'settings_updated', 'ads_settings', null, {
    requireApproval: settings.requireApproval,
    utmSource: settings.utmSource,
    utmMedium: settings.utmMedium,
    utmCampaign: settings.utmCampaign,
    timezone: settings.timezone,
  });
  return NextResponse.json({ settings });
}
