import { describe, expect, it } from 'vitest';
import { appendUtm } from './utm';

describe('appendUtm', () => {
  const defaults = { utmSource: 'adscentre', utmMedium: 'social', utmCampaign: 'always-on' };

  it('appends configured params', () => {
    const out = appendUtm('https://rehabsync.app/pricing', defaults);
    const url = new URL(out);
    expect(url.searchParams.get('utm_source')).toBe('adscentre');
    expect(url.searchParams.get('utm_medium')).toBe('social');
    expect(url.searchParams.get('utm_campaign')).toBe('always-on');
  });

  it('never overwrites utm params already on the URL', () => {
    const out = appendUtm('https://rehabsync.app/?utm_source=newsletter', defaults);
    const url = new URL(out);
    expect(url.searchParams.get('utm_source')).toBe('newsletter');
    expect(url.searchParams.get('utm_medium')).toBe('social');
  });

  it('preserves existing non-utm query params and fragments', () => {
    const out = appendUtm('https://rehabsync.app/blog?id=7#section', { utmSource: 'x' });
    const url = new URL(out);
    expect(url.searchParams.get('id')).toBe('7');
    expect(url.hash).toBe('#section');
    expect(url.searchParams.get('utm_source')).toBe('x');
  });

  it('returns the URL untouched when no defaults are configured', () => {
    expect(appendUtm('https://rehabsync.app/', {})).toBe('https://rehabsync.app/');
    expect(appendUtm('https://rehabsync.app/', { utmSource: '  ' })).toBe('https://rehabsync.app/');
  });

  it('leaves malformed and non-http URLs alone', () => {
    expect(appendUtm('not a url', defaults)).toBe('not a url');
    expect(appendUtm('mailto:hi@rehabsync.app', defaults)).toBe('mailto:hi@rehabsync.app');
  });
});
