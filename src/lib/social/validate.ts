import type { SocialPlatform } from '@/db/schema';

/** Per-platform composition rules enforced in the composer and again at publish time. */
export interface PlatformRules {
  label: string;
  maxChars: number;
  requiresImage: boolean;
  supportsLink: boolean;
  /** false = no API publishing in v1 — targets become manual-export checklist items. */
  apiPublishing: boolean;
}

export const PLATFORM_RULES: Record<SocialPlatform, PlatformRules> = {
  facebook: { label: 'Facebook Page', maxChars: 63206, requiresImage: false, supportsLink: true, apiPublishing: true },
  instagram: { label: 'Instagram', maxChars: 2200, requiresImage: true, supportsLink: false, apiPublishing: true },
  linkedin: { label: 'LinkedIn', maxChars: 3000, requiresImage: false, supportsLink: true, apiPublishing: false },
  tiktok: { label: 'TikTok', maxChars: 2200, requiresImage: false, supportsLink: false, apiPublishing: false },
  youtube: { label: 'YouTube', maxChars: 5000, requiresImage: false, supportsLink: true, apiPublishing: false },
  x: { label: 'X (Twitter)', maxChars: 280, requiresImage: false, supportsLink: true, apiPublishing: false },
};

export interface PostDraft {
  body: string;
  linkUrl?: string | null;
  imageUrl?: string | null;
}

/** Validate a draft against one platform's rules. Returns human-readable problems (empty = ok). */
export function validateForPlatform(draft: PostDraft, platform: SocialPlatform): string[] {
  const rules = PLATFORM_RULES[platform];
  const problems: string[] = [];
  const body = draft.body.trim();

  if (!body && !draft.imageUrl) {
    problems.push(`${rules.label}: post needs text or an image`);
  }
  if (body.length > rules.maxChars) {
    problems.push(`${rules.label}: ${body.length}/${rules.maxChars} characters — too long`);
  }
  if (rules.requiresImage && !draft.imageUrl?.trim()) {
    problems.push(`${rules.label}: requires an image`);
  }
  if (draft.linkUrl?.trim() && !rules.supportsLink) {
    problems.push(`${rules.label}: links are not clickable — it will be appended to the caption`);
  }
  if (draft.imageUrl?.trim() && !/^https:\/\//.test(draft.imageUrl.trim())) {
    problems.push(`${rules.label}: image must be a public https URL`);
  }
  return problems;
}

/** Blocking problems only (warnings about link handling don't stop publishing). */
export function blockingProblems(draft: PostDraft, platform: SocialPlatform): string[] {
  return validateForPlatform(draft, platform).filter((p) => !p.includes('not clickable'));
}
