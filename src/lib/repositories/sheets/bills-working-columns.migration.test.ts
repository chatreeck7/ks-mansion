import { describe, expect, it } from 'vitest';
import { createGoogleSheetsClient, mintAccessToken } from './google-sheets-client';
import { BILLS_TAB, createSheetsBillRepository } from './sheets-bill-repository';

/**
 * Appends the three working columns to the live `bills` tab (KS-24).
 *
 * ใบแจ้งค่าห้องพัก prints the derivation beside each charge — the dial range
 * `11900 - 11948`, `48` units, `7` บาท — and the bills tab stored only the
 * amounts. The document cannot print what the row does not hold, and looking
 * the reading up again at print time would let a later correction restate a
 * bill already handed over. So three columns are added:
 *
 *   `electricity_previous` · `electricity_current` · `water_quantity`
 *
 * The rate is not among them. It is divided out of the amount, so the printed
 * rate can never fail to multiply back to the total beside it.
 *
 * **Appended at the far right, never inserted** (docs/sheet-schema.md rule 4
 * and the KS-68 migration note): every column resolves by name, so appending
 * removes the column-shift risk entirely.
 *
 * Values stay blank on rows already issued. That is deliberate and the
 * document handles it — an older bill prints its amounts with the working
 * left empty rather than showing a derivation nobody recorded.
 *
 * Run once, by hand:
 *
 *   KS_MANSION_DB_SPREADSHEET_ID=<the live id> \
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat ~/.secrets/ks-mansion-service-account.json)" \
 *   KS24_ADD_BILL_WORKING_COLUMNS=yes \
 *   npx vitest run src/lib/repositories/sheets/bills-working-columns.migration.test.ts
 *
 * Gated like the payments migration, and safe the same four ways: it does
 * nothing unless its own variable is set; the header comes from the
 * repository's contract rather than being retyped; a tab already carrying the
 * columns is left completely alone; and it finishes by reading the tab back
 * **through the repository**, so a pass means the console can use it.
 *
 * **The header is written through the API directly, not through
 * `SheetsClient`.** `updateRow` refuses row 1 on purpose — the header is the
 * contract every other read resolves against, and a caller that overwrote it
 * would silently re-point every column. That guard is right and stays; a
 * migration whose whole job is to change the header goes around it, exactly
 * as the payments migration goes around the client to create a tab. The first
 * attempt at this card called `updateRow(tab, 1, …)` and was correctly
 * refused, which is the guard doing its job.
 */

const TAB_NAME = BILLS_TAB.tabName;
const HEADER = [...BILLS_TAB.contract.columns];

const spreadsheetId = process.env.KS_MANSION_DB_SPREADSHEET_ID?.trim() ?? '';
const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ?? '';
const applying = process.env.KS24_ADD_BILL_WORKING_COLUMNS?.trim() === 'yes';
const enabled = applying && spreadsheetId !== '' && credentialsJson !== '';
/** Asked for the migration, but something it needs came through empty. */
const halfConfigured = applying && !enabled;

/**
 * A half-configured run must fail, not skip — "1 skipped" reads like a pass,
 * and the cause is usually a `cat` that failed further up the scrollback.
 * This has happened; see the KS-68 suite.
 */
describe.runIf(halfConfigured)('bills working-columns migration configuration', () => {
  it('has everything the migration needs', () => {
    const missing = [
      spreadsheetId === '' ? 'KS_MANSION_DB_SPREADSHEET_ID' : null,
      credentialsJson === '' ? 'GOOGLE_SERVICE_ACCOUNT_JSON' : null,
    ].filter((name): name is string => name !== null);

    throw new Error(
      `KS24_ADD_BILL_WORKING_COLUMNS is set but ${missing.join(' and ')} came through empty, ` +
        `so nothing was changed. If you passed it as "$(cat <path>)", check that path exists — ` +
        `a failed cat substitutes an empty string.`,
    );
  });
});

/**
 * Writes row 1. Straight to the API, for the reason in the header comment:
 * `SheetsClient.updateRow` refuses row 1 by design, and that guard protects
 * every other read in the console.
 *
 * Only ever called with the sheet's existing header plus names appended at
 * the end, so no column a row already holds can change position.
 */
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

async function writeHeader(values: string[]): Promise<void> {
  const { token } = await mintAccessToken(credentialsJson, fetch, Date.now);
  // Spelled out to the last column rather than anchored at A1 and left to the
  // API to widen: the one write this file makes should say exactly which
  // cells it touches.
  const range = `'${TAB_NAME.replace(/'/g, "''")}'!A1:${columnLetter(values.length)}1`;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
      `/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ values: [values] }),
    },
  );

  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`Could not write the "${TAB_NAME}" header (${response.status}): ${body}`);
  }
}

describe.skipIf(!enabled)(`migration: add the working columns to "${TAB_NAME}"`, () => {
  it('appends the missing headers and leaves every existing row alone', async () => {
    const client = createGoogleSheetsClient({ credentialsJson, spreadsheetId });

    const values = await client.getTabValues(TAB_NAME);
    const header = values[0];
    expect(header, `"${TAB_NAME}" has no header row — nothing to append to.`).toBeDefined();

    const present = new Set(header!.map((name) => name.trim()));
    const missing = HEADER.filter((name) => !present.has(name));

    if (missing.length === 0) {
      // Already migrated. Say so by checking the console can read the tab,
      // rather than by writing anything.
      const bills = createSheetsBillRepository(client);
      await bills.listBills();
      return;
    }

    // Every name the contract expects and the sheet does not have, appended
    // in contract order at the far right. Columns the sheet has that the
    // contract does not are left exactly where they are: the sheet is
    // admin-owned and carries columns the console deliberately does not model.
    const updated = [...header!, ...missing];
    await writeHeader(updated);

    // Read back through the repository. A run that passes has to mean the
    // console can use the tab, not that the API returned 200.
    const bills = createSheetsBillRepository(client);
    const after = await bills.listBills();

    // The rows were not touched, so every one of them must still parse — and
    // the new columns read as "not recorded" rather than as zero.
    for (const bill of after) {
      expect(bill.electricityPrevious).toBeNull();
      expect(bill.electricityCurrent).toBeNull();
      expect(bill.waterQuantity).toBeNull();
    }
  });
});
