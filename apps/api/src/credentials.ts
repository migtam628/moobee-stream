import crypto from 'node:crypto';

/** Compare high-entropy service keys in constant time using fixed-size hashes. */
export function matchesApiKey(value: unknown, expected: string): boolean {
  if (typeof value !== 'string' || Buffer.byteLength(expected, 'utf8') < 32) {
    return false;
  }
  const actualDigest = crypto.createHash('sha256').update(value, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}
