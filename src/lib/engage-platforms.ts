/**
 * Networks the inbox and social listening can receive engagement/mentions from. This is broader
 * than the *publishing* platform set (which needs per-network OAuth in Connections) — inbound
 * engagement and listening only need a normalising gateway pointed at our webhooks.
 *
 * Plain constants (no server imports) so both server and client can use them.
 */
export const ENGAGE_PLATFORMS = [
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
  'x',
  'threads',
  'pinterest',
  'bluesky',
  'reddit',
  'google_business',
] as const;

export type EngagePlatform = (typeof ENGAGE_PLATFORMS)[number];

export const ENGAGE_PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  threads: 'Threads',
  pinterest: 'Pinterest',
  bluesky: 'Bluesky',
  reddit: 'Reddit',
  google_business: 'Google Business',
};

export function engagePlatformLabel(platform: string): string {
  return ENGAGE_PLATFORM_LABELS[platform] ?? platform;
}

export function isEngagePlatform(platform: string): boolean {
  return (ENGAGE_PLATFORMS as readonly string[]).includes(platform);
}
