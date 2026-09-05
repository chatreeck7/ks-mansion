import { describe, expect, it } from 'vitest';
import { createGoogleSheetsClient } from './google-sheets-client';
import { createSheetsLeaseRepository } from './sheets-lease-repository';

/**
 * A one-off data correction, applied through the console's own write path.
 *
 * `l-001` carries `advance_rent = 2636`. That is the old **month-total**
 * figure — 2,200 rent + 336 ไฟ + 100 น้ำ — which `rent_rate` was already
 * corrected away from. Advance rent on room 101 is one month's rent: 2,200.
 * Flagged on KS-68 on 2026-08-26, confirmed wrong by the owner on
 * 2026-09-05.
 *
 * **This writes to the live spreadsheet.** It is a test file only because
 * this repo has no script runner and adding one for a single cell would be
 * the larger change; it is a migration, and it is gated like one:
 *
 *   KS_MANSION_DB_SPREADSHEET_ID=<the live id> \
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
 *   KS68_APPLY_L001_FIX=yes \
 *   npx vitest run src/lib/repositories/sheets/l001-advance-rent.correction.test.ts
 *
 * Three properties make that safe to run, and safe to re-run:
 *
 * - It refuses unless `KS68_APPLY_L001_FIX` is set explicitly, so it can
 *   never fire as a side effect of the ordinary suite or of CI.
 * - It **asserts the current value is the expected wrong one** before writing.
 *   If the cell already reads 2,200 the correction is done and the run is a
 *   no-op; if it reads anything else, someone has edited it since and the run
 *   stops rather than overwriting a decision it does not know about.
 * - It goes through `updateLease`, so the parse-before-write guard applies —
 *   the same refusal to write a row that could not be read back that every
 *   other write gets. Every column the console does not model is carried
 *   across untouched.
 */

const WRONG_VALUE = 2636;
const CORRECT_VALUE = 2200;
const LEASE_ID = 'l-001';

const spreadsheetId = process.env.KS_MANSION_DB_SPREADSHEET_ID?.trim() ?? '';
const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ?? '';
const applying = process.env.KS68_APPLY_L001_FIX?.trim() === 'yes';
const enabled = applying && spreadsheetId !== '' && credentialsJson !== '';

describe.skipIf(!enabled)(`correction: ${LEASE_ID} advance_rent → ${CORRECT_VALUE}`, () => {
  it('corrects the month-total figure to one month of rent, and leaves the rest alone', async () => {
    const leases = createSheetsLeaseRepository(
      createGoogleSheetsClient({ credentialsJson, spreadsheetId }),
    );

    const before = await leases.getLease(LEASE_ID);
    expect(before, `${LEASE_ID} is not in this spreadsheet`).not.toBeNull();

    if (before!.advanceRent === CORRECT_VALUE) {
      // Already applied. Nothing to do, and nothing to assert beyond that.
      return;
    }

    expect(
      before!.advanceRent,
      `Expected advance_rent to still be the stale ${WRONG_VALUE}. It reads ` +
        `${before!.advanceRent}, so someone has changed it since this correction was ` +
        `written — stopping rather than overwriting that.`,
    ).toBe(WRONG_VALUE);

    const after = await leases.updateLease(LEASE_ID, { advanceRent: CORRECT_VALUE });
    expect(after.advanceRent).toBe(CORRECT_VALUE);

    // The one figure moved, and nothing near it did. `rent_rate` in
    // particular is the value this one was confused with.
    expect(after.rentRate).toBe(before!.rentRate);
    expect(after.deposit).toBe(before!.deposit);
    expect(after.startDate).toEqual(before!.startDate);
    expect(after.occupantCount).toBe(before!.occupantCount);

    // And it reads back from the sheet, not just from the returned object.
    expect(await leases.getLease(LEASE_ID)).toMatchObject({ advanceRent: CORRECT_VALUE });
  });
});
