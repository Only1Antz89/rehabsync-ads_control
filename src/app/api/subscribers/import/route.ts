import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { adsSubscribers, adsSuppressions, getDb } from '@/db';
import { recordAudit } from '@/lib/audit';
import { isValidEmail } from '@/lib/newsletters';
import { isResponse, requireSession } from '@/lib/route-auth';

const MAX_ROWS = 2000;

/**
 * CSV import: `email[,name]` per line. A consent source is REQUIRED — imports assert consent was
 * already collected (event sign-up sheet, existing-customer list…). Suppressed addresses are never
 * re-imported; existing subscribers are skipped, imported ones land as active with consent stamped.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    csv?: string;
    consentSource?: string;
    tags?: string[];
  } | null;

  const consentSource = body?.consentSource?.trim() ?? '';
  if (!consentSource) {
    return NextResponse.json(
      { error: 'Consent source is required — record where permission to email came from.' },
      { status: 400 },
    );
  }
  const csv = body?.csv ?? '';
  if (!csv.trim()) return NextResponse.json({ error: 'CSV is empty.' }, { status: 400 });
  const tags = [...new Set((body?.tags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 20);

  const db = getDb();
  const existingEmails = new Set(
    (await db.select({ email: sql<string>`lower(${adsSubscribers.email})` }).from(adsSubscribers)).map((r) => r.email),
  );
  const suppressedEmails = new Set(
    (await db.select({ email: adsSuppressions.email }).from(adsSuppressions)).map((r) => r.email),
  );

  let imported = 0;
  let skipped = 0;
  const lines = csv.split(/\r?\n/).slice(0, MAX_ROWS);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [emailRaw, ...nameParts] = trimmed.split(',');
    const email = emailRaw?.trim().toLowerCase() ?? '';
    if (!isValidEmail(email) || email === 'email') {
      skipped += 1;
      continue;
    }
    if (existingEmails.has(email) || suppressedEmails.has(email)) {
      skipped += 1;
      continue;
    }
    const name = nameParts.join(',').trim().slice(0, 160) || null;
    await db.insert(adsSubscribers).values({
      email,
      name,
      status: 'active',
      tags,
      consentSource: `import:${consentSource.slice(0, 100)}`,
      consentAt: new Date(),
    });
    existingEmails.add(email);
    imported += 1;
  }

  await recordAudit(session, 'subscribers_imported', 'ads_subscriber', null, {
    imported,
    skipped,
    consentSource,
  });
  return NextResponse.json({ ok: true, imported, skipped });
}
