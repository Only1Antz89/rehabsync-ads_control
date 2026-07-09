import type { SocialPlatform } from '@/db/schema';

/** Per-platform composition rules enforced in the composer and again at publish time. */
export interface PlatformRules {
  label: string;
  maxChars: number;
  requiresImage: boolean;
  requiresVideo: boolean;
  /** Platform needs an explicit title (YouTube). */
  requiresTitle: boolean;
  supportsLink: boolean;
  /** false = no API publishing in v1 — targets become manual-export checklist items. */
  apiPublishing: boolean;
}

export const PLATFORM_RULES: Record<SocialPlatform, PlatformRules> = {
  facebook: { label: 'Facebook Page', maxChars: 63206, requiresImage: false, requiresVideo: false, requiresTitle: false, supportsLink: true, apiPublishing: true },
  instagram: { label: 'Instagram', maxChars: 2200, requiresImage: true, requiresVideo: false, requiresTitle: false, supportsLink: false, apiPublishing: true },
  linkedin: { label: 'LinkedIn', maxChars: 3000, requiresImage: false, requiresVideo: false, requiresTitle: false, supportsLink: true, apiPublishing: true },
  tiktok: { label: 'TikTok', maxChars: 2200, requiresImage: false, requiresVideo: true, requiresTitle: false, supportsLink: false, apiPublishing: true },
  youtube: { label: 'YouTube', maxChars: 5000, requiresImage: false, requiresVideo: true, requiresTitle: true, supportsLink: true, apiPublishing: true },
  x: { label: 'X (Twitter)', maxChars: 280, requiresImage: false, requiresVideo: false, requiresTitle: false, supportsLink: true, apiPublishing: false },
};

export interface PostDraft {
  body: string;
  linkUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  title?: string | null;
}

/** Media must be public https; plain http is tolerated for loopback hosts only (local testing). */
function acceptableMediaUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

/** Validate a draft against one platform's rules. Returns human-readable problems (empty = ok). */
export function validateForPlatform(draft: PostDraft, platform: SocialPlatform): string[] {
  const rules = PLATFORM_RULES[platform];
  const problems: string[] = [];
  const body = draft.body.trim();

  if (!body && !draft.imageUrl && !draft.videoUrl) {
    problems.push(`${rules.label}: post needs text, an image or a video`);
  }
  if (body.length > rules.maxChars) {
    problems.push(`${rules.label}: ${body.length}/${rules.maxChars} characters — too long`);
  }
  if (rules.requiresImage && !draft.imageUrl?.trim()) {
    problems.push(`${rules.label}: requires an image`);
  }
  if (rules.requiresVideo && !draft.videoUrl?.trim()) {
    problems.push(`${rules.label}: requires a video`);
  }
  if (rules.requiresTitle && !draft.title?.trim()) {
    problems.push(`${rules.label}: requires a title`);
  }
  if (draft.linkUrl?.trim() && !rules.supportsLink) {
    problems.push(`${rules.label}: links are not clickable — it will be appended to the caption`);
  }
  if (draft.imageUrl?.trim() && !acceptableMediaUrl(draft.imageUrl.trim())) {
    problems.push(`${rules.label}: image must be a public https URL`);
  }
  if (draft.videoUrl?.trim() && !acceptableMediaUrl(draft.videoUrl.trim())) {
    problems.push(`${rules.label}: video must be a public https URL`);
  }
  return problems;
}

/** Blocking problems only (warnings about link handling don't stop publishing). */
export function blockingProblems(draft: PostDraft, platform: SocialPlatform): string[] {
  return validateForPlatform(draft, platform).filter((p) => !p.includes('not clickable'));
}
