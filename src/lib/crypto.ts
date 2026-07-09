// AES-256-GCM at-rest encryption for OAuth tokens (pattern mirrors the main repo's
// apps/api/src/common/crypto/encrypt.ts; self-contained format for this app).
// Payload format: base64( iv[12] | authTag[16] | ciphertext ).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function key(): Buffer {
  const secret = process.env['REHABSYNC_ENCRYPTION_KEY'];
  if (!secret) throw new Error('REHABSYNC_ENCRYPTION_KEY is not set');
  return createHash('sha256').update(secret).digest();
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptToken(payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
