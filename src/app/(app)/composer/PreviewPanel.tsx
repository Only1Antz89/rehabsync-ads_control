'use client';

// Per-network post previews: how the caption (override-aware), media, and link render on each
// selected target, with live character counts against that platform's limit.
import React from 'react';
import { Play, Link2 } from 'lucide-react';
import { PLATFORM_RULES } from '@/lib/social/validate';
import type { SocialPlatform } from '@/db/schema';

export interface PreviewTarget {
  key: string; // accountId for connected accounts, platform for manual targets
  name: string; // display name shown on the preview card
  platform: SocialPlatform;
}

interface PreviewDraft {
  body: string;
  images: string[];
  videoUrl: string | null;
  title: string | null;
  linkUrl: string | null;
}

const ACTION_ROWS: Partial<Record<SocialPlatform, string>> = {
  facebook: 'Like · Comment · Share',
  instagram: '♥ Like · 💬 Comment · ↗ Share',
  linkedin: 'Like · Comment · Repost · Send',
  x: 'Reply · Repost · Like',
  tiktok: '♥ · 💬 · Share',
  youtube: '👍 · Comment · Share',
};

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function MediaBlock({ draft, platform }: { draft: PreviewDraft; platform: SocialPlatform }) {
  const rules = PLATFORM_RULES[platform];
  if (draft.videoUrl && (rules.requiresVideo || !draft.images.length)) {
    return (
      <div className="rounded-lg flex flex-col items-center justify-center gap-1 aspect-video" style={{ backgroundColor: '#0f172a' }}>
        <Play size={26} color="#ffffff" />
        {platform === 'youtube' && draft.title && (
          <span className="text-xs px-2 text-center" style={{ color: '#e2e8f0' }}>{draft.title}</span>
        )}
      </div>
    );
  }
  if (draft.images.length === 0) return null;
  if (draft.images.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={draft.images[0]} alt="" className="w-full rounded-lg object-cover max-h-56" />
    );
  }
  const shown = draft.images.slice(0, 4);
  const extra = draft.images.length - 4;
  return (
    <div className="grid grid-cols-2 gap-1">
      {shown.map((url, i) => (
        <div key={url} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-24 rounded object-cover" />
          {i === 3 && extra > 0 && (
            <span className="absolute inset-0 rounded flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: 'rgba(15,23,42,0.6)' }}>
              +{extra}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function PreviewPanel({
  targets,
  draft,
  overrides,
}: {
  targets: PreviewTarget[];
  draft: PreviewDraft;
  overrides: Record<string, string>;
}) {
  if (targets.length === 0) return null;

  return (
    <div className="space-y-3">
      {targets.map((target) => {
        const rules = PLATFORM_RULES[target.platform];
        const caption = overrides[target.key]?.trim() || draft.body;
        const over = caption.length > rules.maxChars;
        const shownCaption = over ? caption.slice(0, rules.maxChars) : caption;
        const overflow = over ? caption.slice(rules.maxChars) : '';
        return (
          <div key={target.key} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}>
            {/* Card header — account identity */}
            <div className="flex items-center gap-2 px-3 pt-3">
              <span
                className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {(target.name || 'R')[0]?.toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{target.name}</span>
                <span className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>{rules.label} · just now</span>
              </span>
            </div>

            {/* Caption */}
            <div className="px-3 py-2">
              <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>
                {shownCaption || <span style={{ color: 'var(--text-muted)' }}>Your caption appears here…</span>}
                {over && (
                  <span className="line-through" style={{ color: 'var(--color-error-text)' }}>{overflow}</span>
                )}
              </p>
            </div>

            {/* Media */}
            <div className="px-3">
              <MediaBlock draft={draft} platform={target.platform} />
            </div>

            {/* Link card / caption-link note */}
            {draft.linkUrl && rules.supportsLink && (
              <div className="mx-3 mt-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-[10px] uppercase tracking-wide flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <Link2 size={10} /> {domainOf(draft.linkUrl)}
                </p>
                <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{draft.title || draft.linkUrl}</p>
              </div>
            )}
            {draft.linkUrl && !rules.supportsLink && (
              <p className="mx-3 mt-1 text-[10px]" style={{ color: 'var(--color-warning-text)' }}>
                Links aren&apos;t clickable in {rules.label} captions — it will show as plain text.
              </p>
            )}

            {/* Footer — fake action row + char count */}
            <div className="flex items-center justify-between px-3 py-2 mt-1 border-t" style={{ borderColor: 'var(--border-secondary)' }}>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{ACTION_ROWS[target.platform] ?? 'Like · Comment'}</span>
              <span className="text-[11px] font-medium" style={{ color: over ? 'var(--color-error-text)' : 'var(--text-muted)' }}>
                {caption.length.toLocaleString('en-GB')} / {rules.maxChars.toLocaleString('en-GB')}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
