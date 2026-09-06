import { describe, expect, it } from 'vitest';
import { createGoogleSheetsClient, mintAccessToken } from './google-sheets-client';
import { createSheetsPaymentRepository, PAYMENTS_TAB } from './sheets-payment-repository';

/**
 * Creates the `payments` tab on the live spreadsheet (KS-23).
 *
 * KS-23 needs a tab that does not exist yet, and **the console cannot create
 * one**: nothing in `SheetsClient` adds a sheet, deliberately — the console
 * reads and writes rows in tabs a person set up, and a program that invents
 * tabs on a shared spreadsheet is a program that eventually invents the wrong
 * one. So this is a migration, run once, by hand:
 *
 *   KS_MANSION_DB_SPREADSHEET_ID=<the live id> \
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat ~/.secrets/ks-mansion-service-account.json)" \
 *   KS23_CREATE_PAYMENTS_TAB=yes \
 *   npx vitest run src/lib/repositories/sheets/payments-tab.migration.test.ts
 *
 * It is a test file for the same reason the `l-001` correction is: this repo
 * has no script runner, and adding one to create a single tab would be the
 * larger change. It is gated the same way, and four properties make it safe
 * to run and safe to re-run:
 *
 * - It does nothing unless `KS23_CREATE_PAYMENTS_TAB` is set explicitly, so
 *   it can never fire from the ordinary suite or from CI.
 * - **The header comes from the repository's own contract**, never retyped.
 *   A header that drifted from the parser is exactly the failure the whole
 *   read-by-name layer exists to prevent, and retyping seven column names
 *   into a migration script is how that drift starts.
 * - Creating a tab that already exists is a no-op, not an error — and if the
 *   tab is there with rows in it, it is left completely alone. A migration
 *   that rewrote a header over live data would be worse than one that fails.
 * - It finishes by reading the tab back **through the repository**, so a
 *   successful run means the console can actually use what was created,
 *   rather than that an API call returned 200.
 *
 * Unlike the KS-68 experiment this is *meant* for the live spreadsheet, so
 * there is no production-id refusal here. What it writes is one header row in
 * a tab that did not exist.
 */

const TAB_NAME = PAYMENTS_TAB.tabName;
const HEADER = [...PAYMENTS_TAB.contract.columns];

const spreadsheetId = process.env.KS_MANSION_DB_SPREADSHEET_ID?.trim() ?? '';
const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ?? '';
const applying = process.env.KS23_CREATE_PAYMENTS_TAB?.trim() === 'yes';
const enabled = applying && spreadsheetId !== '' && credentialsJson !== '';
/** Asked for the migration, but something it needs came through empty. */
const halfConfigured = applying && !enabled;

/**
 * A half-configured run must fail, not skip — "1 skipped" reads like a pass,
 * and the actual cause is usually a `cat` that failed further up the
 * scrollback. This has happened; see the KS-68 suite.
 */
describe.runIf(halfConfigured)('payments tab migration configuration', () => {
  it('has everything the migration needs', () => {
    const missing = [
      spreadsheetId === '' ? 'KS_MANSION_DB_SPREADSHEET_ID' : null,
      credentialsJson === '' ? 'GOOGLE_SERVICE_ACCOUNT_JSON' : null,
    ].filter((name): name is string => name !== null);

    throw new Error(
      `KS23_CREATE_PAYMENTS_TAB is set but ${missing.join(' and ')} came through empty, ` +
        `so nothing was created. If you passed it as "$(cat <path>)", check that path exists — ` +
        `a failed cat substitutes an empty string.`,
    );
  });
});

/**
 * Adds the sheet. `batchUpdate` directly rather than through `SheetsClient`,
 * which offers no way to create a tab — see the note above about why that is
 * a feature. Returns false when the tab was already there.
 */
async function addSheet(): Promise<boolean> {
  const { token } = await mintAccessToken(credentialsJson, fetch, Date.now);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB_NAME } } }] }),
    },
  );

  if (response.ok) return true;

  const body = (await response.text()).slice(0, 300);
  if (body.includes('already exists')) return false;
  throw new Error(`Could not create the "${TAB_NAME}" tab (${response.status}): ${body}`);
}

describe.skipIf(!enabled)(`migration: create the "${TAB_NAME}" tab`, () => {
  it('creates the tab with the contract header, and is safe to run twice', async () => {
    const client = createGoogleSheetsClient({ credentialsJson, spreadsheetId });

    let existing: string[][] = [];
    try {
      existing = await client.getTabValues(TAB_NAME);
    } catch {
      // Absent. `addSheet` below is the answer either way — a tab that turns
      // out to exist comes back as "already exists" rather than as damage.
    }

    if (existing.length > 0) {
      // Already set up. Check the header still matches the contract and stop:
      // rewriting a header over rows that are already there is the one thing
      // this migration must never do.
      expect(
        existing[0],
        `"${TAB_NAME}" already exists with a header that does not match the contract. ` +
          `Fix it by hand — this migration will not rewrite a header over live rows.`,
      ).toEqual(HEADER);
      return;
    }

    await addSheet();
    await client.appendRow(TAB_NAME, HEADER);

    // Read back through the repository, not the client: a run that passes has
    // to mean the console can use the tab, not that the API said 200.
    const payments = createSheetsPaymentRepository(client);
    expect(await payments.listPayments()).toEqual([]);
  });
});
