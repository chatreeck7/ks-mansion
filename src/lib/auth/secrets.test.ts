import { describe, expect, it } from 'vitest';
import { readAuthSecrets } from './secrets';

const VALID = {
  CONSOLE_PASSWORD_HASH: 'a'.repeat(64),
  SESSION_SECRET: 's'.repeat(32),
};

describe('readAuthSecrets', () => {
  it('returns both secrets when configured', () => {
    expect(readAuthSecrets(VALID)).toEqual({
      passwordHash: VALID.CONSOLE_PASSWORD_HASH,
      sessionSecret: VALID.SESSION_SECRET,
    });
  });

  it('returns null when either secret is missing — misconfiguration must fail closed', () => {
    // The whole point: an unset secret locks the console, it does not open it.
    expect(readAuthSecrets({})).toBeNull();
    expect(readAuthSecrets(undefined)).toBeNull();
    expect(readAuthSecrets({ CONSOLE_PASSWORD_HASH: VALID.CONSOLE_PASSWORD_HASH })).toBeNull();
    expect(readAuthSecrets({ SESSION_SECRET: VALID.SESSION_SECRET })).toBeNull();
  });

  it('treats blank or whitespace-only secrets as unset', () => {
    expect(readAuthSecrets({ ...VALID, SESSION_SECRET: '' })).toBeNull();
    expect(readAuthSecrets({ ...VALID, SESSION_SECRET: '   ' })).toBeNull();
    expect(readAuthSecrets({ ...VALID, CONSOLE_PASSWORD_HASH: '  ' })).toBeNull();
  });

  it('rejects a session secret too short to be worth signing with', () => {
    expect(readAuthSecrets({ ...VALID, SESSION_SECRET: 'short' })).toBeNull();
  });

  it('rejects a password hash that is not a sha-256 hex digest', () => {
    expect(readAuthSecrets({ ...VALID, CONSOLE_PASSWORD_HASH: 'plaintext-password' })).toBeNull();
  });
});
