import type { CellValue, SheetsClient } from './sheets-client';
import { base64url, parseServiceAccount, pemToPkcs8 } from './service-account';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Read **and write** (KS-66). Widened from `spreadsheets.readonly`, which is
 * not a formality: a leaked service-account key used to cost a read of the
 * sheet and now costs the sheet. Two things follow from that and are worth
 * keeping true — the key stays a Cloudflare secret and is never logged, and
 * this scope stays the narrowest one that works. `drive` would also grant
 * writes and would additionally hand over every other file in the account.
 */
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/**
 * `RAW`, never `USER_ENTERED`.
 *
 * `USER_ENTERED` parses each value as though a person typed it, which is
 * exactly wrong here: `1 มี.ค. 2568` is a Thai Buddhist-era *string* the read
 * path parses itself, and letting Sheets interpret it re-introduces the
 * พ.ศ.-vs-CE trap that docs/admin-collaboration.md warns about — it would
 * rewrite the cell to something `parseThaiDate` then rejects.
 *
 * The usual reason people reach for `USER_ENTERED` is to get numbers stored
 * as numbers rather than text. That is handled instead by sending numbers as
 * JSON numbers, which `RAW` stores as numbers — so `=SUM()` still works for
 * an admin, without handing Sheets a licence to reinterpret anything else.
 */
const VALUE_INPUT_OPTION = 'RAW';

const TOKEN_LIFETIME_SECONDS = 3600;
/** Refresh early so a token cannot expire mid-flight. */
const TOKEN_EXPIRY_SKEW_MS = 60_000;

export interface GoogleSheetsClientOptions {
  /** Contents of the service-account JSON key. */
  credentialsJson: string;
  spreadsheetId: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * A service-account access token for the Sheets API.
 *
 * Exported for the KS-68 experiment, which has to make a `batchUpdate` call —
 * creating a tab — that `SheetsClient` deliberately does not offer. Re-doing
 * the JWT dance in the caller would be a second copy of the auth that could
 * drift from this one; widening `SheetsClient` to carry an operation only a
 * one-off setup needs would be worse.
 */
export async function mintAccessToken(
  credentialsJson: string,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<{ token: string; expiresAt: number }> {
  const { clientEmail, privateKey } = parseServiceAccount(credentialsJson);
  const issuedAt = Math.floor(now() / 1000);

  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + TOKEN_LIFETIME_SECONDS,
      }),
    ),
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${base64url(new Uint8Array(signature))}`;

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    // Body carries Google's reason (e.g. invalid_grant when the clock is off
    // or the key was revoked) — worth surfacing rather than just the status.
    throw new Error(
      `Google token request failed (${response.status}): ${(await response.text()).slice(0, 200)}`,
    );
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Google token response contained no access_token.');

  return {
    token: body.access_token,
    expiresAt: now() + (body.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000,
  };
}

/**
 * The A1 range for a whole tab, quoted so a name with a space or an
 * apostrophe cannot break out of the range and address something else. A1
 * escapes an apostrophe by doubling it.
 */
function a1Tab(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'`;
}

/** The A1 range for one whole row, from column A rightwards. */
function a1Row(tabName: string, rowNumber: number, width: number): string {
  return `${a1Tab(tabName)}!A${rowNumber}:${columnLetter(width)}${rowNumber}`;
}

/** 1 → 'A', 26 → 'Z', 27 → 'AA'. */
function columnLetter(oneBasedIndex: number): string {
  let letters = '';
  let n = oneBasedIndex;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * The header row. Writing to it would replace the schema contract itself with
 * a row of data, and every subsequent read would resolve columns by whatever
 * landed there — the single most destructive write this client can make, and
 * cheap to rule out.
 */
const HEADER_ROW = 1;

/**
 * A `SheetsClient` backed by the Sheets REST API v4, authenticated with a
 * service-account JWT. Whole-tab reads and whole-row writes.
 *
 * The access token is cached on the instance until shortly before it expires,
 * so a page render costs one Sheets call rather than a token round trip plus
 * a read.
 */
export function createGoogleSheetsClient(options: GoogleSheetsClientOptions): SheetsClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt - TOKEN_EXPIRY_SKEW_MS > now()) return cached.token;
    cached = await mintAccessToken(options.credentialsJson, fetchImpl, now);
    return cached.token;
  }

  /**
   * One Sheets call, with the auth header and the error handling every call
   * needs. `context` names what was being attempted, so a 403 on a write
   * doesn't read like a 403 on a read.
   */
  async function request(
    path: string,
    context: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const token = await accessToken();
    const url = `${SHEETS_API}/${encodeURIComponent(options.spreadsheetId)}${path}`;

    const response = await fetchImpl(url, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });

    if (response.status === 403 || response.status === 404) {
      throw new Error(
        `Sheets API ${response.status} for ${context}. Check the spreadsheet id, that the ` +
          `sheet is shared with the service account, and — for a write — that the share is ` +
          `Editor rather than Viewer.`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `Sheets API request failed for ${context} (${response.status}): ` +
          `${(await response.text()).slice(0, 200)}`,
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }

  return {
    async getTabValues(tabName: string): Promise<string[][]> {
      // A bare tab name as the range reads the whole used area of that tab.
      const body = await request(
        `/values/${encodeURIComponent(tabName)}`,
        `tab "${tabName}"`,
      );

      if (body.values === undefined) return [];
      if (!Array.isArray(body.values)) {
        throw new Error(`Sheets API returned a non-array "values" for tab "${tabName}".`);
      }

      // Sheets omits trailing empty cells, so rows arrive ragged. Callers
      // resolve cells by header index, so a short row must read as blank
      // rather than undefined.
      return body.values.map((row) =>
        Array.isArray(row) ? row.map((cell) => (cell == null ? '' : String(cell))) : [],
      );
    },

    async appendRow(tabName: string, values: CellValue[]): Promise<void> {
      if (values.length === 0) {
        // Same reason as `updateRow`: the API reports success, and the blank
        // row it leaves reads back as blank and is skipped — so a caller that
        // built the row wrong gets a record that silently does not exist.
        throw new Error(`Refusing to append an empty row to tab "${tabName}".`);
      }

      // INSERT_ROWS, not the default OVERWRITE: with OVERWRITE the API writes
      // into whatever it decides is the first empty row after the table,
      // which lands on top of an admin's notes if they left a gap and then
      // wrote something below it.
      const query = new URLSearchParams({
        valueInputOption: VALUE_INPUT_OPTION,
        insertDataOption: 'INSERT_ROWS',
      });

      await request(
        `/values/${encodeURIComponent(a1Tab(tabName))}:append?${query}`,
        `append to tab "${tabName}"`,
        { method: 'POST', body: JSON.stringify({ values: [values] }) },
      );
    },

    async updateRow(tabName: string, rowNumber: number, values: CellValue[]): Promise<void> {
      if (!Number.isInteger(rowNumber) || rowNumber <= HEADER_ROW) {
        throw new Error(
          `Refusing to write row ${rowNumber} of tab "${tabName}": row ${HEADER_ROW} is the ` +
            `header, and data rows start at ${HEADER_ROW + 1}.`,
        );
      }
      if (values.length === 0) {
        // An empty range would be a no-op that silently reports success, so a
        // caller that built the row wrong would never find out.
        throw new Error(`Refusing to write an empty row to tab "${tabName}".`);
      }

      const query = new URLSearchParams({ valueInputOption: VALUE_INPUT_OPTION });
      const range = a1Row(tabName, rowNumber, values.length);

      await request(
        `/values/${encodeURIComponent(range)}?${query}`,
        `row ${rowNumber} of tab "${tabName}"`,
        { method: 'PUT', body: JSON.stringify({ values: [values] }) },
      );
    },
  };
}
