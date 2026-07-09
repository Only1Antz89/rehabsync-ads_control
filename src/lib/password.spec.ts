import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing (scrypt, platform-compatible format)', () => {
  it('round-trips a password', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password and malformed hashes', () => {
    const hash = hashPassword('s3cret-password');
    expect(verifyPassword('wrong-password', hash)).toBe(false);
    expect(verifyPassword('s3cret-password', 'not-a-hash')).toBe(false);
    expect(verifyPassword('s3cret-password', '')).toBe(false);
  });

  it('normalises unicode (NFKC) so composed/decomposed forms match', () => {
    const composed = 'café-password';
    const decomposed = 'café-password';
    expect(verifyPassword(decomposed, hashPassword(composed))).toBe(true);
  });

  it('salts every hash (same input, different hashes)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });
});
