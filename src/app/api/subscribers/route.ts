import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { SUBSCRIBER_STATUSES, adsSubscribers, getDb } from '@/db';
import { recordAudit } from '@/lib/audit';
import { isValidEmail } from '@/lib/newsletters';
import { isResponse, requireSession } from '@/lib/route-auth';

/** List subscribers. ?q= matches email/name, ?status= filters, ?tag= filters by tag. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? '';
  const tag = url.searchParams.get('tag')?.trim() ?? '';

  const conditions = [];
  if (q) {
    const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
    conditions.push(or(ilike(adsSubscribers.email, like), ilike(adsSubscribers.name, like)));
  }
  if (status && (SUBSCRIBER_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(adsSubscribers.status, status));
  }
  if (tag) {
    conditions.push(sql`${adsSubscribers.tags} @> ${JSON.stringify([tag])}::jsonb`);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(adsSubscribers)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adsSubscribers.createdAt))
    .limit(200);

  return NextResponse.json({ subscribers: rows });
}

/**
 * Manually add a subscriber (staff). Requires a consent source — the list is consent-based only,
 * so staff must record where the permission came from. Added as active with consent stamped now.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    name?: string;
    tags?: string[];
    consentSource?: string;
  } | null;

  const email = body?.email?.trim().toLowerCase() ?? '';
  const consentSource = body?.consentSource?.trim() ?? '';
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (!consentSource) {
    return NextResponse.json(
      { error: 'Consent source is required — record where permission to email came from.' },
      { status: 400 },
    );
  }
  const tags = [...new Set((body?.tags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 20);

  const db = getDb();
  const [existing] = await db
    .select({ id: adsSubscribers.id, status: adsSubscribers.status })
    .from(adsSubscribers)
    .where(eq(sql`lower(${adsSubscribers.email})`, email))
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: 'That address is already on the list.' }, { status: 409 });
  }

  const [created] = await db
    .insert(adsSubscribers)
    .values({
      email,
      name: body?.name?.trim().slice(0, 160) || null,
      status: 'active',
      tags,
      consentSource: `manual:${consentSource.slice(0, 100)}`,
      consentAt: new Date(),
    })
    .returning({ id: adsSubscribers.id });

  await recordAudit(session, 'subscriber_added', 'ads_subscriber', created?.id ?? null, {
    email,
    consentSource,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
