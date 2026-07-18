'use client';

// Full-post preview per placement format. One composed post is framed differently by every network
// (feed / square / story / link card / thumbnail…): this renders the post's primary media cropped
// to each real placement ratio (object-cover) next to the caption and that platform's character
// limit, so the user sees the final look — and how a Canva design gets cropped — before publishing.
// Button-triggered; works with or without publish targets selected.
import React, { useEffect, useState } from 'react';
import { X, Play, ImageOff } from 'lucide-react';
import { PREVIEW_FORMATS, PREVIEW_PLATFORMS, formatsForPlatform, type PreviewFormat } from '@/lib/canva/preview-formats';
import { PLATFORM_RULES } from '@/lib/social/validate';
import type { SocialPlatform } from '@/db/schema';

export interface FormatPreviewDraft {
  body: string;
  images: string[];
  videoUrl: string | null;
  title: string | null;
  linkUrl: string | null;
}

function FrameMedia({ draft, format }: { draft: FormatPreviewDraft; format: PreviewFormat }) {
  const rules = PLATFORM_RULES[format.platform];
  const primary = draft.images[0] ?? null;
  const showVideo = Boolean(draft.videoUrl) && (rules.requiresVideo || !primary);

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border"
      style={{ aspectRatio: `${format.ratioW} / ${format.ratioH}`, borderColor: 'var(--border-primary)', backgroundColor: '#0f172a' }}
    >
      {showVideo ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <Play size={24} color="#ffffff" />
          {format.platform === 'youtube' && draft.title && (
            <span className="text-[10px] px-2 text-center" style={{ color: '#e2e8f0' }}>{draft.title}</span>
          )}
        </div>
      ) : primary ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={primary} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center"><ImageOff size={20} color="#64748b" /></div>
      )}
      {format.fullBleed && (
        <>
          {/* Story/Reel safe-area: the network's own chrome sits over the top ~14% and bottom ~20%. */}
          <div className="absolute inset-x-0 top-0 h-[14%]" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)' }} />
          <div className="absolute inset-x-0 bottom-0 h-[20%]" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)' }} />
        </>
      )}
    </div>
  );
}

export function FormatPreviewModal({
  open,
  onClose,
  draft,
  captions,
}: {
  open: boolean;
  onClose: () => void;
  draft: FormatPreviewDraft;
  /** Optional per-network caption (from per-network overrides); falls back to the base caption. */
  captions: Partial<Record<SocialPlatform, string>>;
}) {
  const [platform, setPlatform] = useState<SocialPlatform | 'all'>('all');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const formats = platform === 'all' ? PREVIEW_FORMATS : formatsForPlatform(platform);
  const hasContent = draft.images.length > 0 || Boolean(draft.videoUrl) || draft.body.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(15,23,42,0.6)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Post preview per format"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border shadow-xl my-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-secondary)' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Preview — final look per format</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Your primary media cropped to each real placement. Anything outside a frame is cropped by that network —
              keep key text and logos inside every frame you plan to post to.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-lg p-1.5 shrink-0" style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {!hasContent && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Add a caption, image or video to see the preview.</p>
          )}

          {/* Platform filter */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPlatform('all')}
              className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer"
              style={platform === 'all'
                ? { backgroundColor: 'var(--brand-primary)', color: '#fff' }
                : { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              All networks
            </button>
            {PREVIEW_PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer"
                style={platform === p
                  ? { backgroundColor: 'var(--brand-primary)', color: '#fff' }
                  : { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
              >
                {PLATFORM_RULES[p].label}
              </button>
            ))}
          </div>

          {/* Placement frames */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {formats.map((f) => {
              const rules = PLATFORM_RULES[f.platform];
              const caption = captions[f.platform] ?? draft.body;
              const over = caption.length > rules.maxChars;
              return (
                <div key={f.key} className="space-y-1.5">
                  <FrameMedia draft={draft} format={f} />
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{f.label}</p>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{f.pixels}</span>
                  </div>
                  {caption.trim() && (
                    <p className="text-[11px] whitespace-pre-wrap break-words line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
                      {over ? caption.slice(0, rules.maxChars) : caption}
                      {over && <span className="line-through" style={{ color: 'var(--color-error-text)' }}>{caption.slice(rules.maxChars)}</span>}
                    </p>
                  )}
                  <p className="text-[10px]" style={{ color: over ? 'var(--color-error-text)' : 'var(--text-muted)' }}>
                    {caption.length.toLocaleString('en-GB')} / {rules.maxChars.toLocaleString('en-GB')} chars
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
