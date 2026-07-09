/**
 * SMTP2GO sender — the company's existing provider (same pattern as Sales Centre). Base URL is
 * env-overridable so newsletter sending is E2E-testable against a stub; unconfigured environments
 * skip sends gracefully.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendResult {
  sent: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
}

function apiBase(): string {
  return (process.env['REHABSYNC_SMTP2GO_URL'] ?? 'https://api.smtp2go.com').replace(/\/+$/, '');
}

export function emailConfigured(): boolean {
  return Boolean(process.env['REHABSYNC_SMTP2GO_API_KEY']);
}

export function senderAddress(): string {
  return process.env['REHABSYNC_EMAIL_SENDER'] ?? 'RehabSync <news@rehabsync.app>';
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function sendEmail(message: OutboundEmail): Promise<SendResult> {
  const apiKey = process.env['REHABSYNC_SMTP2GO_API_KEY'];
  if (!apiKey) {
    console.warn('[email] REHABSYNC_SMTP2GO_API_KEY not set — send skipped:', message.subject);
    return { sent: false, skipped: true };
  }

  try {
    const res = await fetch(`${apiBase()}/v3/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        sender: senderAddress(),
        to: [message.to],
        subject: message.subject,
        html_body: message.html,
        text_body: message.text ?? stripHtml(message.html),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => null)) as {
      data?: { succeeded?: number; email_id?: string; error?: string; failures?: unknown[] };
    } | null;
    if (!res.ok || !data?.data || (data.data.succeeded ?? 0) < 1) {
      return { sent: false, error: data?.data?.error ?? `HTTP ${res.status}` };
    }
    return { sent: true, messageId: data.data.email_id };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}
