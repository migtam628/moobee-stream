import crypto from 'node:crypto';

/** Compare high-entropy service keys without leaking length/timing on match. */
export function matchesApiKey(value: unknown, expected: string): boolean {
  if (typeof value !== 'string' || expected.length < 32) return false;
  const providedBytes = Buffer.from(value, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (providedBytes.length !== expectedBytes.length || expectedBytes.length < 32) {
    // No equality result is possible; avoid accidental acceptance.
    return false;
  }
  return crypto.timingSafeEqual(providedBytes, expectedBytes);
}
