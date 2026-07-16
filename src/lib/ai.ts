export interface ReplySuggestion {
  suggestion: string;
  source: 'ai' | 'unavailable';
  error?: string;
}

export interface ThreadContext {
  platform: string;
  kind: string;
  messages: { direction: string; authorName: string | null; body: string }[];
}

export function aiConfigured(): boolean {
  return Boolean(process.env['REHABSYNC_AI_URL'] && process.env['REHABSYNC_AI_API_KEY']);
}

/** Low-level OpenAI-style chat call shared by the reply and caption helpers. */
async function chatComplete(system: string, user: string, maxTokens: number): Promise<ReplySuggestion> {
  const url = process.env['REHABSYNC_AI_URL'];
  const key = process.env['REHABSYNC_AI_API_KEY'];
  const model = process.env['REHABSYNC_AI_MODEL'] ?? 'gemini-3.5-flash';
  if (!url || !key) return { suggestion: '', source: 'unavailable' };
  try {
    const res = await fetch(url.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => null)) as
      | { text?: string; choices?: { message?: { content?: string } }[] }
      | null;
    if (!res.ok) return { suggestion: '', source: 'unavailable', error: `HTTP ${res.status}` };
    const text = (data?.choices?.[0]?.message?.content ?? data?.text ?? '').trim();
    return text ? { suggestion: text, source: 'ai' } : { suggestion: '', source: 'unavailable', error: 'Empty suggestion.' };
  } catch (err) {
    return { suggestion: '', source: 'unavailable', error: (err as Error).message };
  }
}

export type CaptionMode = 'draft' | 'improve' | 'shorten' | 'hashtags';

export interface CaptionRequest {
  mode: CaptionMode;
  platform?: string;
  topic?: string;
  text?: string;
  voice?: string;
}

/**
 * Draft or refine a social caption. Provider-agnostic (same LLMProvider as replies). Always returns
 * text the human edits before it goes anywhere — the AI never publishes. Forbids medical advice.
 */
export async function craftCaption(req: CaptionRequest): Promise<ReplySuggestion> {
  const forPlatform = req.platform ? ` for ${req.platform}` : '';
  const voiceLine = req.voice?.trim() ? ` Match this brand voice: ${req.voice.trim().slice(0, 600)}.` : '';
  const system =
    'You are a social-media manager for a physiotherapy technology platform. Write engaging, on-brand ' +
    'captions. Never give medical advice, diagnoses, or treatment instructions. Return only the caption ' +
    'text — no preamble, no surrounding quotes.' +
    voiceLine;
  let user: string;
  switch (req.mode) {
    case 'draft':
      user = `Write a social post caption${forPlatform} about: ${(req.topic ?? '').slice(0, 500)}. Keep it concise and end with a light call to action.`;
      break;
    case 'improve':
      user = `Improve this caption${forPlatform}, keeping its meaning but making it more engaging:\n\n${(req.text ?? '').slice(0, 2000)}`;
      break;
    case 'shorten':
      user = `Rewrite this caption${forPlatform} to be shorter and punchier while keeping the key message:\n\n${(req.text ?? '').slice(0, 2000)}`;
      break;
    case 'hashtags':
      user = `Suggest 5–8 relevant, non-spammy hashtags${forPlatform} for this caption. Return only the hashtags on a single line:\n\n${(req.text ?? '').slice(0, 2000)}`;
      break;
    default:
      return { suggestion: '', source: 'unavailable', error: 'Unknown mode.' };
  }
  return chatComplete(system, user, 220);
}

/**
 * Draft a suggested reply for an inbox thread. Provider-agnostic: POSTs an OpenAI-style chat
 * request to REHABSYNC_AI_URL (model from REHABSYNC_AI_MODEL, default gemini-3.5-flash — never
 * hardcoded) and accepts either `{choices:[{message:{content}}]}` or `{text}`. Returns a draft the
 * human edits and sends — it never posts on its own. The prompt forbids medical advice.
 */
export async function suggestReply(ctx: ThreadContext): Promise<ReplySuggestion> {
  const url = process.env['REHABSYNC_AI_URL'];
  const key = process.env['REHABSYNC_AI_API_KEY'];
  const model = process.env['REHABSYNC_AI_MODEL'] ?? 'gemini-3.5-flash';
  if (!url || !key) return { suggestion: '', source: 'unavailable' };

  const system =
    'You are a friendly, professional social-media manager for a physiotherapy technology platform. ' +
    'Draft a concise, warm reply (1–3 sentences) to the audience message. Be helpful and on-brand. ' +
    'Do NOT give medical advice, diagnoses, or treatment instructions; if clinical advice is asked ' +
    'for, gently suggest they speak with their clinician. Return only the reply text.';
  const convo = ctx.messages
    .map((m) => `${m.direction === 'out' ? 'Us' : m.authorName ?? 'Them'}: ${m.body}`)
    .join('\n');
  const userPrompt = `Platform: ${ctx.platform}\nType: ${ctx.kind}\nConversation:\n${convo}\n\nDraft our reply:`;

  try {
    const res = await fetch(url.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 200,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => null)) as
      | { text?: string; choices?: { message?: { content?: string } }[] }
      | null;
    if (!res.ok) return { suggestion: '', source: 'unavailable', error: `HTTP ${res.status}` };
    const text = (data?.choices?.[0]?.message?.content ?? data?.text ?? '').trim();
    return text ? { suggestion: text, source: 'ai' } : { suggestion: '', source: 'unavailable', error: 'Empty suggestion.' };
  } catch (err) {
    return { suggestion: '', source: 'unavailable', error: (err as Error).message };
  }
}
