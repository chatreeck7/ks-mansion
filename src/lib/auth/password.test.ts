import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('hashPassword / verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('is case- and whitespace-sensitive', async () => {
    const hash = await hashPassword('Secret123');
    expect(await verifyPassword('secret123', hash)).toBe(false);
    expect(await verifyPassword(' Secret123', hash)).toBe(false);
  });

  it('produces a stable lowercase hex digest', async () => {
    const hash = await hashPassword('abc');
    expect(hash).toBe(await hashPassword('abc'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tolerates a differently-cased stored hash', async () => {
    // An admin pasting the hash into a secret field may upper-case it.
    const hash = await hashPassword('abc');
    expect(await verifyPassword('abc', hash.toUpperCase())).toBe(true);
  });

  it('rejects rather than throws when the stored hash is missing or malformed', async () => {
    for (const bad of ['', 'not-a-hash', 'abc123']) {
      expect(await verifyPassword('abc', bad)).toBe(false);
    }
  });

  it('rejects an empty password even against a hash of the empty string', async () => {
    // Guards the "unset secret" case: an empty submitted password must never
    // authenticate, whatever the stored hash happens to be.
    const hash = await hashPassword('');
    expect(await verifyPassword('', hash)).toBe(false);
  });
});
