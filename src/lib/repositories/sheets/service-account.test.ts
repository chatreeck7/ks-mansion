import { describe, expect, it } from 'vitest';
import { parseServiceAccount, pemToPkcs8, base64url } from './service-account';

// A structurally valid but fake key — enough to exercise parsing without
// carrying a real credential into the repo.
const FAKE_PEM = [
  '-----BEGIN PRIVATE KEY-----',
  'MIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEAtest',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  '-----END PRIVATE KEY-----',
].join('\n');

function credentials(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'service_account',
    client_email: 'ks-mansion-console@example.iam.gserviceaccount.com',
    private_key: FAKE_PEM,
    ...overrides,
  });
}

describe('parseServiceAccount', () => {
  it('extracts the client email and private key', () => {
    const parsed = parseServiceAccount(credentials());
    expect(parsed.clientEmail).toBe('ks-mansion-console@example.iam.gserviceaccount.com');
    expect(parsed.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('un-escapes \\n in the private key', () => {
    // Pasting a key into a secret field usually turns real newlines into
    // literal backslash-n; without this the PEM will not decode.
    const escaped = credentials({ private_key: FAKE_PEM.replace(/\n/g, '\\n') });
    expect(parseServiceAccount(escaped).privateKey).toContain('\n');
    expect(parseServiceAccount(escaped).privateKey).not.toContain('\\n');
  });

  it('throws a named error on invalid JSON rather than a parse error', () => {
    expect(() => parseServiceAccount('not json')).toThrow(/not valid JSON/i);
  });

  it('throws when a required field is missing', () => {
    expect(() => parseServiceAccount(credentials({ client_email: undefined }))).toThrow(
      /client_email/,
    );
    expect(() => parseServiceAccount(credentials({ private_key: undefined }))).toThrow(
      /private_key/,
    );
  });

  it('throws when handed something that is not a service-account key', () => {
    // e.g. an OAuth client secret pasted by mistake.
    expect(() => parseServiceAccount(JSON.stringify({ type: 'authorized_user' }))).toThrow(
      /service_account/,
    );
  });
});

describe('pemToPkcs8', () => {
  it('strips the PEM armour and decodes the body', () => {
    const bytes = pemToPkcs8(FAKE_PEM);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('tolerates carriage returns and surrounding whitespace', () => {
    const crlf = `\n  ${FAKE_PEM.replace(/\n/g, '\r\n')}  \n`;
    expect(pemToPkcs8(crlf)).toEqual(pemToPkcs8(FAKE_PEM));
  });

  it('throws when the armour is missing', () => {
    expect(() => pemToPkcs8('just some base64')).toThrow(/PRIVATE KEY/);
  });
});

describe('base64url', () => {
  it('emits URL-safe output with no padding', () => {
    const encoded = base64url(new TextEncoder().encode('any ?? bytes ~~ here >>'));
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('round-trips through atob after restoring standard base64', () => {
    const original = 'hello world';
    const encoded = base64url(new TextEncoder().encode(original));
    const restored = encoded.replace(/-/g, '+').replace(/_/g, '/');
    expect(atob(restored + '='.repeat((4 - (restored.length % 4)) % 4))).toBe(original);
  });
});
