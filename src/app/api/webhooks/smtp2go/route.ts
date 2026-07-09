import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import {
  adsEmailEvents,
  adsNewsletterRecipients,
  adsSubscribers,
  adsSuppressions,
  getDb,
} from '@/db';

/** SMTP2GO event webhook → per-recipient tracking + subscriber status. Verified via a shared
 *  secret (?secret= query or x-webhook-secret header, matching REHABSYNC_SMTP2GO_WEBHOOK_SECRET). */

const EVENT_MAP: Record<string, string> = {
  delivered: 'delivered',
  open: 'open',
  opened: 'open',
  click: 'click',
  clicked: 'click',
  bounce: 'bounce',
  hard_bounce: 'bounce',
  soft_bounce: 'bounce',
  spam: 'spam',
  spam_complaint: 'spam',
  unsubscribe: 'unsub',
};

const RECIPIENT_STATUS: Record<string, string> = {
  delivered: 'delivered',
  open: 'opened',
  click: 'clicked',
  bounce: 'bounced',
  spam: 'bounced',
  unsub: 'unsubscribed',
};

interface WebhookEvent {
  event?: string;
  event_type?: string;
  email?: string;
  rcpt?: string;
  recipient?: string;
  message_id?: string;
  email_id?: string;
  ['smtp-id']?: string;
  url?: string;
}

export async function POST(req: Request) {
  const secret = process.env['REHABSYNC_SMTP2GO_WEBHOOK_SECRET'];
  const url = new URL(req.url);
  const provided = url.searchParams.get('secret') ?? req.headers.get('x-webhook-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = (await req.json().catch(() => null)) as WebhookEvent | WebhookEvent[] | null;
  if (!payload) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  const events = Array.isArray(payload) ? payload : [payload];

  const db = getDb();
  let processed = 0;
  for (const raw of events.slice(0, 100)) {
    const kind = EVENT_MAP[(raw.event ?? raw.event_type ?? '').toLowerCase()];
    const email = (raw.email ?? raw.rcpt ?? raw.recipient ?? '').trim().toLowerCase();
    if (!kind || !email) continue;

    const messageId = raw.message_id ?? raw.email_id ?? raw['smtp-id'] ?? null;
    const [recipient] = messageId
      ? await db
          .select()
          .from(adsNewsletterRecipients)
          .where(eq(adsNewsletterRecipients.messageId, messageId))
          .limit(1)
      : [];

    await db.insert(adsEmailEvents).values({
      newsletterId: recipient?.newsletterId ?? null,
      recipientId: recipient?.id ?? null,
      email,
      event: kind,
      url: raw.url ?? null,
      raw: raw as unknown as Record<string, unknown>,
    });

    const nextStatus = RECIPIENT_STATUS[kind];
    if (recipient && nextStatus) {
      // Only move "forward" (sent → delivered → opened → clicked); never downgrade a click to a delivery.
      const rank: Record<string, number> = { pending: 0, sent: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, unsubscribed: 6, failed: 0, suppressed: 6 };
      if ((rank[nextStatus] ?? 0) > (rank[recipient.status] ?? 0)) {
        await db
          .update(adsNewsletterRecipients)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(adsNewsletterRecipients.id, recipient.id));
      }
    }

    // Bounces / spam complaints / provider-level unsubscribes auto-suppress + flip the subscriber.
    if (kind === 'bounce' || kind === 'spam' || kind === 'unsub') {
      const reason = kind === 'unsub' ? 'unsubscribed' : kind === 'spam' ? 'spam' : 'bounced';
      await db
        .insert(adsSuppressions)
        .values({ email, reason, source: 'smtp2go_webhook' })
        .onConflictDoNothing();
      await db
        .update(adsSubscribers)
        .set(
          kind === 'unsub'
            ? { status: 'unsubscribed', unsubscribedAt: new Date(), updatedAt: new Date() }
            : { status: 'bounced', updatedAt: new Date() },
        )
        .where(eq(sql`lower(${adsSubscribers.email})`, email));
    }
    processed += 1;
  }

  return NextResponse.json({ ok: true, processed });
}
