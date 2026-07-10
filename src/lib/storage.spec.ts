import { describe, expect, it } from 'vitest';
import { objectPath, sanitizeFilename } from './storage';

describe('sanitizeFilename', () => {
  it('lowercases and strips unsafe characters', () => {
    expect(sanitizeFilename('My Clinic Video (Final).MP4')).toBe('my-clinic-video-final-.mp4');
    expect(sanitizeFilename('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeFilename('höllo wörld.png')).toBe('h-llo-w-rld.png');
  });

  it('never returns an empty name and caps the length', () => {
    expect(sanitizeFilename('***')).toBe('file');
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename(`${'a'.repeat(200)}.jpg`).length).toBeLessThanOrEqual(80);
  });
});

describe('objectPath', () => {
  it('namespaces by kind and month with a random prefix', () => {
    const path = objectPath('image', 'photo.jpg');
    expect(path).toMatch(/^image\/\d{4}\/\d{2}\/[0-9a-f]{16}-photo\.jpg$/);
  });

  it('two uploads of the same file never collide', () => {
    expect(objectPath('video', 'clip.mp4')).not.toBe(objectPath('video', 'clip.mp4'));
  });
});
