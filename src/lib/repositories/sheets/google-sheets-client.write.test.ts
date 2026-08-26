import { describe, expect, it, vi } from 'vitest';
import { createGoogleSheetsClient } from './google-sheets-client';

/**
 * Write-path tests for the real client. Separate file from the read tests
 * because what they check is different in kind: a read that goes wrong
 * returns bad data and can be fixed by fixing the code, where a write that
 * goes wrong has already changed somebody's spreadsheet.
 */

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Records every call, answering the token request first. */
function recordingFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.includes('oauth2.googleapis.com')) {
      return jsonResponse({ access_token: 'tok-123', expires_in: 3600 });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;

  return { fetchImpl, calls, sheetCalls: () => calls.filter((c) => !c.url.includes('oauth2')) };
}

async function clientWith(fetchImpl: typeof fetch) {
  return createGoogleSheetsClient({
    credentialsJson: await generateCredentials(),
    spreadsheetId: 'sheet-1',
    fetchImpl,
    now: () => 1_000_000,
  });
}

describe('appendRow', () => {
  it('sends one row of values to the tab', async () => {
    const { fetchImpl, sheetCalls } = recordingFetch();
    await (await clientWith(fetchImpl)).appendRow('tenants', ['t-004', 'สมชาย', 2200]);

    const [call] = sheetCalls();
    expect(call!.init.method).toBe('POST');
    expect(JSON.parse(String(call!.init.body))).toEqual({
      values: [['t-004', 'สมชาย', 2200]],
    });
  });

  // The default is OVERWRITE, which writes into whatever the API decides is
  // the first empty row after the table — landing on top of an admin's notes
  // if they left a gap and then wrote something below it.
  it('inserts rows rather than overwriting whatever follows the table', async () => {
    const { fetchImpl, sheetCalls } = recordingFetch();
    await (await clientWith(fetchImpl)).appendRow('tenants', ['t-004']);

    expect(decodeURIComponent(sheetCalls()[0]!.url)).toContain('insertDataOption=INSERT_ROWS');
  });

  it('quotes the tab name in the range', async () => {
    const { fetchImpl, sheetCalls } = recordingFetch();
    await (await clientWith(fetchImpl)).appendRow('tenants', ['t-004']);

    expect(decodeURIComponent(sheetCalls()[0]!.url)).toContain("/values/'tenants':append");
  });

  // The append counterpart of `updateRow`'s guard below: the API reports
  // success, and the blank row it leaves reads back as blank and is skipped,
  // so the caller is told it saved a record that does not exist.
  it('refuses an empty row rather than appending a blank one', async () => {
    const { fetchImpl, sheetCalls } = recordingFetch();
    const client = await clientWith(fetchImpl);

    await expect(client.appendRow('tenants', [])).rejects.toThrow(/empty row/);
    expect(sheetCalls()).toHaveLength(0);
  });
});

describe('updateRow', () => {
  it('addresses exactly the row and width it was given', async () => {
    const { fetchImpl, sheetCalls } = recordingFetch();
    await (await clientWith(fetchImpl)).updateRow('rooms', 5, ['101', 'unit', 2200]);

    const [call] = sheetCalls();
    expect(call!.init.method).toBe('PUT');
    expect(decodeURIComponent(call!.url)).toContain("/values/'rooms'!A5:C5?");
  });

  it('spans past column Z for a wide tab', async () => {
    const { fetchImpl, sheetCalls } = recordingFetch();
    const wide = Array.from({ length: 28 }, (_, i) => String(i));
    await (await clientWith(fetchImpl)).updateRow('rooms', 2, wide);

    expect(decodeURIComponent(sheetCalls()[0]!.url)).toContain("'rooms'!A2:AB2");
  });

  // Row 1 is the header — the schema contract itself. Overwriting it would
  // leave every subsequent read resolving columns by whatever landed there,
  // which is the single most destructive write this client can make.
  it('refuses to write the header row, and never reaches the network', async () => {
    const { fetchImpl, sheetCalls } = recordingFetch();
    const client = await clientWith(fetchImpl);

    await expect(client.updateRow('rooms', 1, ['x'])).rejects.toThrow(/row 1 is the header/);
    expect(sheetCalls()).toHaveLength(0);
  });

  it('refuses a row number that is not a positive data row', async () => {
    const { fetchImpl } = recordingFetch();
    const client = await clientWith(fetchImpl);

    for (const bad of [0, -1, 1.5]) {
      await expect(client.updateRow('rooms', bad, ['x']), String(bad)).rejects.toThrow(
        /Refusing to write row/,
      );
    }
  });

  // An empty range is a no-op the API reports as success, so a caller that
  // built its row wrong would be told the save worked.
  it('refuses an empty row rather than silently writing nothing', async () => {
    const { fetchImpl, sheetCalls } = recordingFetch();
    const client = await clientWith(fetchImpl);

    await expect(client.updateRow('rooms', 2, [])).rejects.toThrow(/empty row/);
    expect(sheetCalls()).toHaveLength(0);
  });
});

describe('value handling', () => {
  /**
   * USER_ENTERED would parse each value as though a person typed it, which
   * would rewrite `1 มี.ค. 2568` into whatever Sheets thinks that date is —
   * re-introducing the พ.ศ.-vs-CE trap the read path exists to catch, on the
   * way *in*, where nothing catches it.
   */
  it('writes RAW so Sheets never reinterprets a Thai date', async () => {
    const { fetchImpl, sheetCalls } = recordingFetch();
    await (await clientWith(fetchImpl)).appendRow('leases', ['l-002', '1 มี.ค. 2568']);

    const url = decodeURIComponent(sheetCalls()[0]!.url);
    expect(url).toContain('valueInputOption=RAW');
    expect(url).not.toContain('USER_ENTERED');
  });

  // The usual reason to reach for USER_ENTERED is to get numbers stored as
  // numbers. Sending them as JSON numbers achieves that under RAW, so an
  // admin's =SUM() still works without granting Sheets licence to reinterpret
  // the date column next to it.
  it('keeps numbers as numbers and booleans as booleans in the payload', async () => {
    const { fetchImpl, sheetCalls } = recordingFetch();
    await (await clientWith(fetchImpl)).appendRow('rooms', ['101', 2200, true]);

    expect(JSON.parse(String(sheetCalls()[0]!.init.body)).values[0]).toEqual(['101', 2200, true]);
  });
});

describe('errors', () => {
  it('names a write in the error, and points at the Viewer-vs-Editor case', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('oauth2')) {
        return jsonResponse({ access_token: 'tok-123', expires_in: 3600 });
      }
      return jsonResponse({ error: 'forbidden' }, 403);
    }) as unknown as typeof fetch;

    await expect((await clientWith(fetchImpl)).updateRow('rooms', 3, ['x'])).rejects.toThrow(
      /row 3 of tab "rooms".*Editor rather than Viewer/s,
    );
  });

  it('reuses the cached token across a read and a write', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const client = await clientWith(fetchImpl);

    await client.getTabValues('rooms');
    await client.appendRow('rooms', ['x']);

    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(1);
  });
});
