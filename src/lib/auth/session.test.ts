import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from './session';

const SECRET = 'test-secret-at-least-32-characters-long!!';
const OTHER_SECRET = 'a-different-secret-32-chars-long!!!!!!!!!';
const NOW = Date.UTC(2026, 7, 25, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

describe('createSessionToken / verifySessionToken', () => {
  it('accepts a token it just issued', async () => {
    const token = await createSessionToken(SECRET, NOW + HOUR);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(true);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken(OTHER_SECRET, NOW + HOUR);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(false);
  });

  it('rejects an expired token', async () => {
    const token = await createSessionToken(SECRET, NOW - 1);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(false);
  });

  it('rejects a token whose expiry was tampered with to extend it', async () => {
    // The whole point of signing: moving the expiry forward must invalidate
    // the signature rather than buying a longer session.
    const token = await createSessionToken(SECRET, NOW - 1);
    const [, signature] = token.split('.');
    const forged = `${NOW + HOUR}.${signature}`;
    expect(await verifySessionToken(forged, SECRET, NOW)).toBe(false);
  });

  it('rejects malformed tokens instead of throwing', async () => {
    for (const bad of ['', 'nonsense', 'no-dot-separator', '.', 'abc.def', `${NOW + HOUR}.`]) {
      expect(await verifySessionToken(bad, SECRET, NOW)).toBe(false);
    }
  });

  it('rejects a non-numeric expiry', async () => {
    const token = await createSessionToken(SECRET, NOW + HOUR);
    const [, signature] = token.split('.');
    expect(await verifySessionToken(`later.${signature}`, SECRET, NOW)).toBe(false);
  });

  it('produces a token with no characters that need cookie-escaping', async () => {
    const token = await createSessionToken(SECRET, NOW + HOUR);
    expect(token).toMatch(/^[0-9]+\.[A-Za-z0-9_-]+$/);
  });
});
