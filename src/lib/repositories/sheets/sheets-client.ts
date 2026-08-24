/**
 * The only thing a repository needs from Sheets: the whole tab, as raw rows,
 * header included. Whole-tab reads match the KS-52 spike's recommendation —
 * bounds round trips to a small constant per page render instead of scaling
 * with row count. A real implementation (KS-2) wraps the Sheets API v4
 * client behind this; tests use an in-memory fake — see
 * `sheets-room-repository.test.ts`.
 *
 * Contract: `rows[0]` must be the sheet's actual row 1 (the header), with no
 * skipped title rows or range offset — `SheetRowError` messages compute the
 * sheet row an admin would see as `index + 2`, which only holds if this
 * invariant does.
 */
export interface SheetsClient {
  getTabValues(tabName: string): Promise<string[][]>;
}
