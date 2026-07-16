'use client';

// 1:1 placement previews for a Canva design. A design is a single fixed canvas, but every network
// crops it differently — this renders the design inside each real placement frame (feed, square,
// story, link card, thumbnail…) with object-cover, so the user sees exactly how it will be cropped
// per platform before publishing. Fully client-side: no design data leaves the browser.
import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { PREVIEW_FORMATS, PREVIEW_PLATFORMS, formatsForPlatform } from '@/lib/canva/preview-formats';
import { PLATFORM_RULES } from '@/lib/social/validate';
import type { SocialPlatform } from '@/db/schema';

function FormatFrame({
  thumbnailUrl,
  title,
  ratioW,
  ratioH,
  fullBleed,
}: {
  thumbnailUrl: string | null;
  title: string;
  ratioW: number;
  ratioH: number;
  fullBleed?: boolean;
}) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border"
      style={{ aspectRatio: `${ratioW} / ${ratioH}`, borderColor: 'var(--border-primary)', backgroundColor: '#0f172a' }}
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt={title} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageOff size={20} color="#64748b" />
        </div>
      )}
      {fullBleed && (
        <>
          {/* Story/Reel safe-area: the app's own chrome sits over the top ~14% and bottom ~20%. */}
          <div className="absolute inset-x-0 top-0 h-[14%]" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)' }} />
          <div className="absolute inset-x-0 bottom-0 h-[20%]" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)' }} />
        </>
      )}
    </div>
  );
}

export function CanvaPreviewGrid({ thumbnailUrl, title }: { thumbnailUrl: string | null; title: string }) {
  const [platform, setPlatform] = useState<SocialPlatform | 'all'>('all');
  const formats = platform === 'all' ? PREVIEW_FORMATS : formatsForPlatform(platform);

  return (
    <div className="space-y-4">
      {/* Reference: the design as designed, uncropped. */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-40 shrink-0">
          <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Design (as-is)</p>
          <div className="rounded-lg border overflow-hidden flex items-center justify-center" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', minHeight: 96 }}>
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl} alt={title} className="w-full h-auto object-contain max-h-56" />
            ) : (
              <div className="py-8"><ImageOff size={20} color="#64748b" /></div>
            )}
          </div>
        </div>
        <p className="text-xs flex-1 min-w-[12rem]" style={{ color: 'var(--text-secondary)' }}>
          Below is how <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{title || 'this design'}</span> will be
          framed in each network placement. Anything outside a frame is cropped by that network — check
          key text and logos stay inside every frame you plan to post to.
        </p>
      </div>

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {formats.map((f) => (
          <div key={f.key} className="space-y-1">
            <FormatFrame thumbnailUrl={thumbnailUrl} title={title} ratioW={f.ratioW} ratioH={f.ratioH} fullBleed={f.fullBleed} />
            <div>
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{f.label}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{f.pixels}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
