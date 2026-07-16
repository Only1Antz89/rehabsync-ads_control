import type { SocialPlatform } from '@/db/schema';

/**
 * The real placement formats each social network renders media in. A Canva design is one fixed
 * canvas, but each network crops/frames it differently — these ratios drive the 1:1 previews so a
 * user can see exactly how a design will be cropped per placement before publishing.
 */
export interface PreviewFormat {
  key: string;
  platform: SocialPlatform;
  /** Human label, e.g. "Instagram · Feed". */
  label: string;
  /** Short placement name for the tab/pill, e.g. "Feed". */
  placement: string;
  /** Aspect ratio width/height (used as CSS aspect-ratio). */
  ratioW: number;
  ratioH: number;
  /** Recommended pixel size, shown as a hint. */
  pixels: string;
  /** true for vertical full-screen placements (story/reel) that get a safe-area overlay. */
  fullBleed?: boolean;
}

export const PREVIEW_FORMATS: PreviewFormat[] = [
  { key: 'instagram-feed', platform: 'instagram', label: 'Instagram · Feed', placement: 'Feed', ratioW: 4, ratioH: 5, pixels: '1080 × 1350' },
  { key: 'instagram-square', platform: 'instagram', label: 'Instagram · Square', placement: 'Square', ratioW: 1, ratioH: 1, pixels: '1080 × 1080' },
  { key: 'instagram-story', platform: 'instagram', label: 'Instagram · Story / Reel', placement: 'Story', ratioW: 9, ratioH: 16, pixels: '1080 × 1920', fullBleed: true },
  { key: 'facebook-feed', platform: 'facebook', label: 'Facebook · Feed', placement: 'Feed', ratioW: 1, ratioH: 1, pixels: '1080 × 1080' },
  { key: 'facebook-link', platform: 'facebook', label: 'Facebook · Link share', placement: 'Link', ratioW: 40, ratioH: 21, pixels: '1200 × 630' },
  { key: 'x-post', platform: 'x', label: 'X · In-stream', placement: 'Post', ratioW: 16, ratioH: 9, pixels: '1600 × 900' },
  { key: 'linkedin-feed', platform: 'linkedin', label: 'LinkedIn · Feed', placement: 'Feed', ratioW: 1200, ratioH: 627, pixels: '1200 × 627' },
  { key: 'tiktok', platform: 'tiktok', label: 'TikTok', placement: 'Video', ratioW: 9, ratioH: 16, pixels: '1080 × 1920', fullBleed: true },
  { key: 'youtube', platform: 'youtube', label: 'YouTube · Thumbnail', placement: 'Thumb', ratioW: 16, ratioH: 9, pixels: '1280 × 720' },
];

/** Distinct platforms, in a stable display order, for filter pills. */
export const PREVIEW_PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'x', 'linkedin', 'tiktok', 'youtube'];

export function formatsForPlatform(platform: SocialPlatform): PreviewFormat[] {
  return PREVIEW_FORMATS.filter((f) => f.platform === platform);
}
