// Signed email-action tokens: base64url(email) + '.' + HMAC-SHA256(purpose:email).
// Purpose-scoped so a confirm link can never be replayed as an unsubscribe (or vice versa).
// Must work logged-out and be tamper-proof; the secret never leaves the server.
import { createHmac, timingSafeEqual } from 'node:crypto';

export type TokenPurpose = 'unsubscribe' | 'confirm';

function secret(): string {
  const value = process.env['REHABSYNC_ADS_EMAIL_TOKEN_SECRET'];
  if (!value) throw new Error('REHABSYNC_ADS_EMAIL_TOKEN_SECRET is not set');
  return value;
}

function sign(purpose: TokenPurpose, email: string): string {
  return createHmac('sha256', secret()).update(`${purpose}:${email.toLowerCase()}`).digest('base64url');
}

export function emailToken(purpose: TokenPurpose, email: string): string {
  return `${Buffer.from(email.toLowerCase()).toString('base64url')}.${sign(purpose, email)}`;
}

/** Returns the email when the token verifies for this purpose, null otherwise. */
export function verifyEmailToken(purpose: TokenPurpose, token: string): string | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  let email: string;
  try {
    email = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!email.includes('@')) return null;
  const expected = Buffer.from(sign(purpose, email));
  const candidate = Buffer.from(signature);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate) ? email : null;
}

export const unsubscribeToken = (email: string) => emailToken('unsubscribe', email);
export const confirmToken = (email: string) => emailToken('confirm', email);
