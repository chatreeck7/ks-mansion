import type { SheetsClient } from './sheets-client';
import { base64url, parseServiceAccount, pemToPkcs8 } from './service-account';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
/** Read-only: the console does not write to Sheets yet (KS-18/KS-21 will). */
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

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

async function mintAccessToken(
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
 * A `SheetsClient` backed by the Sheets REST API v4, authenticated with a
 * service-account JWT. Whole-tab reads only, per the KS-52 spike.
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

  return {
    async getTabValues(tabName: string): Promise<string[][]> {
      const token = await accessToken();
      // A bare tab name as the range reads the whole used area of that tab.
      const url =
        `${SHEETS_API}/${encodeURIComponent(options.spreadsheetId)}` +
        `/values/${encodeURIComponent(tabName)}`;

      const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });

      if (response.status === 403 || response.status === 404) {
        throw new Error(
          `Sheets API ${response.status} for tab "${tabName}". Check the spreadsheet id and ` +
            `that the sheet is shared with the service account.`,
        );
      }
      if (!response.ok) {
        throw new Error(
          `Sheets API request failed (${response.status}): ${(await response.text()).slice(0, 200)}`,
        );
      }

      const body = (await response.json()) as { values?: unknown };
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
  };
}
