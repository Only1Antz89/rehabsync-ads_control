import { beforeAll, describe, expect, it } from 'vitest';
import { confirmToken, emailToken, unsubscribeToken, verifyEmailToken } from './tokens';

beforeAll(() => {
  process.env['REHABSYNC_ADS_EMAIL_TOKEN_SECRET'] = 'test-secret';
});

describe('email tokens', () => {
  it('round-trips per purpose and normalises case', () => {
    const token = emailToken('unsubscribe', 'Person@Example.COM');
    expect(verifyEmailToken('unsubscribe', token)).toBe('person@example.com');
  });

  it('a confirm token never verifies as an unsubscribe token', () => {
    expect(verifyEmailToken('unsubscribe', confirmToken('a@b.com'))).toBeNull();
    expect(verifyEmailToken('confirm', unsubscribeToken('a@b.com'))).toBeNull();
  });

  it('rejects tampered payloads and signatures', () => {
    const token = unsubscribeToken('a@b.com');
    const [payload, sig] = token.split('.');
    const other = Buffer.from('c@d.com').toString('base64url');
    expect(verifyEmailToken('unsubscribe', `${other}.${sig}`)).toBeNull();
    expect(verifyEmailToken('unsubscribe', `${payload}.AAAA`)).toBeNull();
    expect(verifyEmailToken('unsubscribe', 'garbage')).toBeNull();
    expect(verifyEmailToken('unsubscribe', '')).toBeNull();
  });

  it('rejects payloads that are not emails', () => {
    const bogus = Buffer.from('not-an-email').toString('base64url');
    expect(verifyEmailToken('confirm', `${bogus}.sig`)).toBeNull();
  });
});
