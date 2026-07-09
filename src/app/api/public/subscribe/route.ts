import { NextResponse } from 'next/server';
import { subscribeEmail } from '@/lib/newsletters';

export const dynamic = 'force-dynamic';

/**
 * Public newsletter signup (hosted page + embeddable form). Double opt-in: the address only
 * becomes an active subscriber after clicking the confirmation email. The response is identical
 * whether or not the address already exists (anti-enumeration).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    name?: string;
    source?: string;
  } | null;
  if (!body?.email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  const source = (body.source ?? 'hosted_page').slice(0, 100);
  const result = await subscribeEmail(body.email, body.name?.trim().slice(0, 160) || null, `signup:${source}`);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Could not subscribe.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: 'Check your inbox to confirm your subscription.' });
}
