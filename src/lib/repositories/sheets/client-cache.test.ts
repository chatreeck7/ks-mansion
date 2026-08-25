import { describe, expect, it } from 'vitest';
import { getSheetsClient, __resetSheetsClientCache } from './client-cache';

const CREDS = '{"type":"service_account"}';

describe('getSheetsClient', () => {
  it('returns the same client for the same spreadsheet, so the token cache survives', () => {
    // The whole point: a fresh client per request means the access-token
    // cache inside it never hits, costing an RSA signature and an extra
    // round trip on every page render.
    __resetSheetsClientCache();
    const first = getSheetsClient(CREDS, 'sheet-1');
    expect(getSheetsClient(CREDS, 'sheet-1')).toBe(first);
  });

  it('builds a new client when the spreadsheet changes', () => {
    __resetSheetsClientCache();
    const first = getSheetsClient(CREDS, 'sheet-1');
    expect(getSheetsClient(CREDS, 'sheet-2')).not.toBe(first);
  });

  it('builds a new client when the credentials change', () => {
    // Rotating the service-account key must not keep serving a client
    // holding a token minted from the old one.
    __resetSheetsClientCache();
    const first = getSheetsClient(CREDS, 'sheet-1');
    expect(getSheetsClient('{"type":"service_account","v":2}', 'sheet-1')).not.toBe(first);
  });

  it('does not hold the credential string on the cache key', () => {
    __resetSheetsClientCache();
    getSheetsClient(CREDS, 'sheet-1');
    // Guards against a refactor that keys the cache on the raw secret and
    // leaves it sitting in module scope longer than it needs to.
    expect(JSON.stringify(__resetSheetsClientCache())).not.toContain('service_account');
  });
});
