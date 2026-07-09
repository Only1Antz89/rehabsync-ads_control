import { describe, expect, it } from 'vitest';
import { blockingProblems, validateForPlatform } from './validate';

describe('per-platform validation', () => {
  it('accepts a plain text post for facebook', () => {
    expect(validateForPlatform({ body: 'Hello clinics!' }, 'facebook')).toEqual([]);
  });

  it('requires an image for instagram', () => {
    const problems = validateForPlatform({ body: 'No image here' }, 'instagram');
    expect(problems.some((p) => p.includes('requires an image'))).toBe(true);
    expect(
      validateForPlatform({ body: 'With image', imageUrl: 'https://cdn.example.com/a.jpg' }, 'instagram'),
    ).toEqual([]);
  });

  it('enforces the x character limit', () => {
    expect(validateForPlatform({ body: 'a'.repeat(281) }, 'x').some((p) => p.includes('too long'))).toBe(true);
    expect(validateForPlatform({ body: 'a'.repeat(280) }, 'x')).toEqual([]);
  });

  it('rejects empty posts and non-https images', () => {
    expect(validateForPlatform({ body: '  ' }, 'facebook').length).toBeGreaterThan(0);
    expect(
      validateForPlatform({ body: 'x', imageUrl: 'http://insecure.example.com/a.jpg' }, 'facebook').length,
    ).toBeGreaterThan(0);
  });

  it('treats link-handling notes as non-blocking', () => {
    const draft = { body: 'Check this', linkUrl: 'https://rehabsync.app', imageUrl: 'https://cdn.example.com/a.jpg' };
    expect(validateForPlatform(draft, 'instagram').some((p) => p.includes('not clickable'))).toBe(true);
    expect(blockingProblems(draft, 'instagram')).toEqual([]);
  });

  it('requires a video for tiktok/youtube and a title for youtube', () => {
    expect(validateForPlatform({ body: 'clip' }, 'tiktok').some((p) => p.includes('requires a video'))).toBe(true);
    const missingTitle = validateForPlatform({ body: 'desc', videoUrl: 'https://cdn.example.com/v.mp4' }, 'youtube');
    expect(missingTitle.some((p) => p.includes('requires a title'))).toBe(true);
    expect(
      validateForPlatform(
        { body: 'desc', videoUrl: 'https://cdn.example.com/v.mp4', title: 'Clinic tour' },
        'youtube',
      ),
    ).toEqual([]);
    expect(
      validateForPlatform({ body: 'x', videoUrl: 'http://insecure.example.com/v.mp4', title: 't' }, 'tiktok').some(
        (p) => p.includes('https'),
      ),
    ).toBe(true);
  });
});
