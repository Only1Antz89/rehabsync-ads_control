import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsNewsletters, getDb } from '@/db';
import { recordAudit } from '@/lib/audit';
import { sendTestNewsletter } from '@/lib/newsletters';
import { isResponse, requireSession } from '@/lib/route-auth';

type Params = { params: Promise<{ id: string }> };

/** Send a single rendered test email for this issue (no recipient rows, no tracking). */
export async function POST(req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { to?: string } | null;
  const to = body?.to?.trim() ?? session.email;

  const db = getDb();
  const [issue] = await db.select().from(adsNewsletters).where(eq(adsNewsletters.id, id)).limit(1);
  if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await sendTestNewsletter(issue, to);
  if (!result.sent) {
    return NextResponse.json({ error: result.error ?? 'Test send failed.' }, { status: 400 });
  }
  await recordAudit(session, 'newsletter_test_sent', 'ads_newsletter', id, { to });
  return NextResponse.json({ ok: true });
}
