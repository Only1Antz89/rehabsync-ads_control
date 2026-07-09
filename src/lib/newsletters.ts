import { and, eq, inArray, isNull, lte, notExists, or, sql } from 'drizzle-orm';
import {
  adsNewsletterRecipients,
  adsNewsletters,
  adsSubscribers,
  adsSuppressions,
  getDb,
} from '@/db';
import type { NewsletterSegment } from '@/db';
import { sendEmail } from './email';
import { renderNewsletterEmail } from './merge';
import { confirmToken, unsubscribeToken } from './tokens';

const SEND_BATCH = 100;

export function appUrl(): string {
  return (process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '');
}

// ── Subscription (double opt-in) ──────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/**
 * Public signup: upsert the subscriber as `pending` and send the double-opt-in confirmation.
 * Consent only becomes effective on confirmation. Already-active subscribers are left alone
 * (the response never reveals whether an address was known — anti-enumeration).
 */
export async function subscribeEmail(
  emailRaw: string,
  name: string | null,
  source: string,
): Promise<{ ok: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(adsSubscribers)
    .where(eq(sql`lower(${adsSubscribers.email})`, email))
    .limit(1);

  if (existing?.status === 'active') return { ok: true }; // nothing to do, say nothing
  if (existing) {
    await db
      .update(adsSubscribers)
      .set({ name: name ?? existing.name, status: 'pending', updatedAt: new Date() })
      .where(eq(adsSubscribers.id, existing.id));
  } else {
    await db.insert(adsSubscribers).values({ email, name, status: 'pending', consentSource: source });
  }

  const confirmUrl = `${appUrl()}/n/confirm/${confirmToken(email)}`;
  const result = await sendEmail({
    to: email,
    subject: 'Confirm your RehabSync newsletter subscription',
    html: [
      `<p>Hi ${name?.trim() || 'there'},</p>`,
      '<p>Please confirm you want to receive the RehabSync newsletter — one click and you are in:</p>',
      `<p><a href="${confirmUrl}" style="display:inline-block;background:#0d9488;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Confirm subscription</a></p>`,
      `<p style="font-size:12px;color:#64748b">If you did not request this, ignore this email — you will not be subscribed.</p>`,
    ].join('\n'),
  });
  if (result.sent || result.skipped) {
    await db
      .update(adsSubscribers)
      .set({ confirmSentAt: new Date(), updatedAt: new Date() })
      .where(eq(sql`lower(${adsSubscribers.email})`, email));
  }
  return { ok: true };
}

/**
 * Double-opt-in confirmation: activate the subscriber and stamp consent. A fresh explicit
 * confirmation also clears an old *unsubscribed* suppression (new consent supersedes it) —
 * bounce/spam suppressions stay, those are deliverability problems, not consent.
 */
export async function confirmSubscriber(email: string): Promise<boolean> {
  const db = getDb();
  const [subscriber] = await db
    .select()
    .from(adsSubscribers)
    .where(eq(sql`lower(${adsSubscribers.email})`, email.toLowerCase()))
    .limit(1);
  if (!subscriber) return false;

  await db
    .update(adsSubscribers)
    .set({ status: 'active', consentAt: subscriber.consentAt ?? new Date(), unsubscribedAt: null, updatedAt: new Date() })
    .where(eq(adsSubscribers.id, subscriber.id));
  await db
    .delete(adsSuppressions)
    .where(and(eq(adsSuppressions.email, email.toLowerCase()), eq(adsSuppressions.reason, 'unsubscribed')));
  return true;
}

/** One-click unsubscribe (logged-out): suppress + flip subscriber and recipient rows. Idempotent. */
export async function unsubscribeEmail(email: string, source: string): Promise<void> {
  const db = getDb();
  const normalized = email.toLowerCase();
  await db
    .insert(adsSuppressions)
    .values({ email: normalized, reason: 'unsubscribed', source })
    .onConflictDoNothing();
  await db
    .update(adsSubscribers)
    .set({ status: 'unsubscribed', unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(eq(sql`lower(${adsSubscribers.email})`, normalized));
  await db
    .update(adsNewsletterRecipients)
    .set({ status: 'unsubscribed', updatedAt: new Date() })
    .where(eq(adsNewsletterRecipients.email, normalized));
}

// ── Audience & sending ────────────────────────────────────────────────────────

/** Resolve a segment to its audience: ACTIVE subscribers only, suppressions excluded, deduped. */
export async function resolveAudience(segment: NewsletterSegment) {
  const db = getDb();
  const conditions = [eq(adsSubscribers.status, 'active')];
  if (segment.tags?.length) {
    const tagConds = segment.tags.map((tag) => sql`${adsSubscribers.tags} @> ${JSON.stringify([tag])}::jsonb`);
    const anyTag = or(...tagConds);
    if (anyTag) conditions.push(anyTag);
  }

  const rows = await db
    .select({
      id: adsSubscribers.id,
      name: adsSubscribers.name,
      email: sql<string>`lower(${adsSubscribers.email})`,
    })
    .from(adsSubscribers)
    .where(
      and(
        ...conditions,
        notExists(
          db
            .select({ one: sql`1` })
            .from(adsSuppressions)
            .where(eq(adsSuppressions.email, sql`lower(${adsSubscribers.email})`)),
        ),
      ),
    );

  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.email)) return false;
    seen.add(row.email);
    return true;
  });
}

/** Materialise the audience into recipient rows (idempotent). */
async function buildRecipients(newsletterId: string, segment: NewsletterSegment): Promise<number> {
  const db = getDb();
  const audience = await resolveAudience(segment);
  if (audience.length === 0) return 0;
  await db
    .insert(adsNewsletterRecipients)
    .values(audience.map((s) => ({ newsletterId, subscriberId: s.id, email: s.email })))
    .onConflictDoNothing({
      target: [adsNewsletterRecipients.newsletterId, adsNewsletterRecipients.email],
    });
  return audience.length;
}

/** Send one batch of a `sending` newsletter. Returns how many recipients remain. */
async function sendBatch(issue: typeof adsNewsletters.$inferSelect): Promise<number> {
  const db = getDb();
  const pending = await db
    .select({
      id: adsNewsletterRecipients.id,
      email: adsNewsletterRecipients.email,
      name: adsSubscribers.name,
    })
    .from(adsNewsletterRecipients)
    .leftJoin(adsSubscribers, eq(adsSubscribers.id, adsNewsletterRecipients.subscriberId))
    .where(and(eq(adsNewsletterRecipients.newsletterId, issue.id), eq(adsNewsletterRecipients.status, 'pending')))
    .limit(SEND_BATCH);

  for (const recipient of pending) {
    // Suppression check at SEND TIME (someone may unsubscribe mid-issue).
    const [suppressed] = await db
      .select({ email: adsSuppressions.email })
      .from(adsSuppressions)
      .where(eq(adsSuppressions.email, recipient.email))
      .limit(1);
    if (suppressed) {
      await db
        .update(adsNewsletterRecipients)
        .set({ status: 'suppressed', updatedAt: new Date() })
        .where(eq(adsNewsletterRecipients.id, recipient.id));
      continue;
    }

    const unsubscribeUrl = `${appUrl()}/unsubscribe/${unsubscribeToken(recipient.email)}`;
    const rendered = renderNewsletterEmail(issue, {
      name: recipient.name,
      email: recipient.email,
      unsubscribeUrl,
    });
    const result = await sendEmail({ to: recipient.email, subject: rendered.subject, html: rendered.html });

    await db
      .update(adsNewsletterRecipients)
      .set(
        result.sent
          ? { status: 'sent', messageId: result.messageId ?? null, updatedAt: new Date() }
          : result.skipped
            ? { status: 'failed', error: 'Email provider not configured', updatedAt: new Date() }
            : { status: 'failed', error: result.error?.slice(0, 500) ?? 'send failed', updatedAt: new Date() },
      )
      .where(eq(adsNewsletterRecipients.id, recipient.id));
  }

  const [row] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(adsNewsletterRecipients)
    .where(and(eq(adsNewsletterRecipients.newsletterId, issue.id), eq(adsNewsletterRecipients.status, 'pending')));
  return row?.remaining ?? 0;
}

/** Claim due newsletters and push each forward one batch. Used by the cron and by "send now". */
export async function processNewsletters(newsletterId?: string): Promise<{ processed: string[] }> {
  const db = getDb();
  const now = new Date();

  const claimed = await db.transaction(async (tx) => {
    const dueCondition = newsletterId
      ? and(eq(adsNewsletters.id, newsletterId), inArray(adsNewsletters.status, ['scheduled', 'sending']))
      : and(
          inArray(adsNewsletters.status, ['scheduled', 'sending']),
          or(isNull(adsNewsletters.scheduledAt), lte(adsNewsletters.scheduledAt, now)),
        );
    const rows = await tx
      .select()
      .from(adsNewsletters)
      .where(dueCondition)
      .limit(3)
      .for('update', { skipLocked: true });
    if (rows.length) {
      await tx
        .update(adsNewsletters)
        .set({ status: 'sending', updatedAt: now })
        .where(inArray(adsNewsletters.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  for (const issue of claimed) {
    await buildRecipients(issue.id, issue.segment); // idempotent on re-claims
    const remaining = await sendBatch({ ...issue, status: 'sending' });
    if (remaining === 0) {
      await getDb()
        .update(adsNewsletters)
        .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
        .where(eq(adsNewsletters.id, issue.id));
    }
    // else: stays 'sending' — the next cron tick sends the next batch.
  }

  return { processed: claimed.map((c) => c.id) };
}

/** Render + send a single test email for an issue (no recipient rows, no tracking). */
export async function sendTestNewsletter(
  issue: { subject: string; html: string },
  to: string,
): Promise<{ sent: boolean; error?: string }> {
  const email = to.trim().toLowerCase();
  if (!isValidEmail(email)) return { sent: false, error: 'Enter a valid email address.' };
  const rendered = renderNewsletterEmail(issue, {
    name: null,
    email,
    unsubscribeUrl: `${appUrl()}/unsubscribe/preview`,
  });
  const result = await sendEmail({
    to: email,
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
  });
  if (result.sent || result.skipped) return { sent: true };
  const out: { sent: boolean; error?: string } = { sent: false };
  if (result.error) out.error = result.error;
  return out;
}
