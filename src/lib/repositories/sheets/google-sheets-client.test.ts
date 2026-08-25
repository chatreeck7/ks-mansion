import { describe, expect, it, vi } from 'vitest';
import { createGoogleSheetsClient } from './google-sheets-client';

// Real RSA key generated per-run via Web Crypto, so the JWT signing path is
// genuinely exercised without committing a credential.
async function generateCredentials(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let binary = '';
  for (const b of pkcs8) binary += String.fromCharCode(b);
  const body = btoa(binary).replace(/(.{64})/g, '$1\n');
  return JSON.stringify({
    type: 'service_account',
    client_email: 'test@example.iam.gserviceaccount.com',
    private_key: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
  });
}

function tokenResponse(expiresIn = 3600) {
  return new Response(JSON.stringify({ access_token: 'tok-123', expires_in: expiresIn }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function valuesResponse(values: unknown) {
  return new Response(JSON.stringify({ values }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function clientWith(fetchImpl: typeof fetch, now = () => 1_000_000) {
  return createGoogleSheetsClient({
    credentialsJson: await generateCredentials(),
    spreadsheetId: 'sheet-1',
    fetchImpl,
    now,
  });
}

describe('createGoogleSheetsClient', () => {
  it('mints a token then reads the tab, and returns the rows', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(valuesResponse([['id', 'room_number'], ['101', '101']]));

    const rows = await (await clientWith(fetchImpl as unknown as typeof fetch)).getTabValues('rooms');

    expect(rows).toEqual([['id', 'room_number'], ['101', '101']]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect((tokenInit as RequestInit).method).toBe('POST');
    const [readUrl, readInit] = fetchImpl.mock.calls[1];
    expect(readUrl).toContain('/spreadsheets/sheet-1/values/rooms');
    expect((readInit as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok-123' });
  });

  it('reuses a cached token across reads instead of re-minting', async () => {
    // A fresh Response per call: a body can only be read once.
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementation(async () => valuesResponse([['id']]));

    const client = await clientWith(fetchImpl as unknown as typeof fetch);
    await client.getTabValues('rooms');
    await client.getTabValues('rooms');

    // 1 token + 2 reads, not 2 tokens + 2 reads.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('re-mints once the cached token is near expiry', async () => {
    let clock = 1_000_000;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse(3600))
      .mockResolvedValueOnce(valuesResponse([['id']]))
      .mockResolvedValueOnce(tokenResponse(3600))
      .mockResolvedValueOnce(valuesResponse([['id']]));

    const client = await clientWith(fetchImpl as unknown as typeof fetch, () => clock);
    await client.getTabValues('rooms');
    clock += 3600 * 1000; // token now expired
    await client.getTabValues('rooms');

    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('pads ragged rows, because Sheets omits trailing empty cells', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(valuesResponse([['id', 'room_number', 'price'], ['206', '206']]));

    const rows = await (await clientWith(fetchImpl as unknown as typeof fetch)).getTabValues('rooms');
    expect(rows[1]).toEqual(['206', '206']);
  });

  it('coerces numeric and null cells to strings', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(valuesResponse([['price'], [2636], [null]]));

    const rows = await (await clientWith(fetchImpl as unknown as typeof fetch)).getTabValues('rooms');
    expect(rows[1]).toEqual(['2636']);
    expect(rows[2]).toEqual(['']);
  });

  it('returns an empty list for a tab with no data rather than throwing', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    expect(await (await clientWith(fetchImpl as unknown as typeof fetch)).getTabValues('rooms')).toEqual([]);
  });

  it('explains a 403 as a sharing problem, which is the usual cause', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('denied', { status: 403 }));

    await expect(
      (await clientWith(fetchImpl as unknown as typeof fetch)).getTabValues('rooms'),
    ).rejects.toThrow(/shared with the service account/);
  });

  it('surfaces the body when the token request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response('{"error":"invalid_grant"}', { status: 400 }),
    );

    await expect(
      (await clientWith(fetchImpl as unknown as typeof fetch)).getTabValues('rooms'),
    ).rejects.toThrow(/invalid_grant/);
  });
});
