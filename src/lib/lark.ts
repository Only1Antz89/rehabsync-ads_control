/**
 * Lark / Feishu custom-bot notifier. Set REHABSYNC_LARK_WEBHOOK_URL to a group's incoming-webhook
 * URL to receive alerts. Best-effort: a failed or unconfigured notification never blocks the
 * caller (e.g. inbox ingestion).
 */
export async function notifyLark(text: string): Promise<void> {
  const url = process.env['REHABSYNC_LARK_WEBHOOK_URL'];
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* never block on a notification */
  }
}
