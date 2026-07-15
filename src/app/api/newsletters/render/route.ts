import { NextResponse } from 'next/server';
import { renderNewsletterEmail } from '@/lib/merge';
import { isResponse, requireSession } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

/**
 * Rendered visual preview of a newsletter draft. Runs the EXACT renderer real sends use
 * (merge tags + the compliance footer when {{unsubscribe_url}} isn't placed explicitly),
 * against a sample subscriber — so what you preview is what recipients get.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { subject?: string; html?: string } | null;
  const subject = body?.subject ?? '';
  const html = body?.html ?? '';

  const rendered = renderNewsletterEmail(
    { subject, html },
    { name: 'Alex Example', email: 'alex@example.com', unsubscribeUrl: '#unsubscribe-preview' },
  );
  return NextResponse.json(rendered);
}
