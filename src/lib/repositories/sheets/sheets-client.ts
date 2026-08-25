/**
 * A value as it goes *into* a cell.
 *
 * Numbers stay JSON numbers rather than becoming strings, so a rent written
 * by the console lands in the sheet as a number an admin can `=SUM()` over.
 * Dates do not appear here at all: they are Thai text (`1 มี.ค. 2568`) and
 * must be written as strings — see the `RAW` note in
 * `google-sheets-client.ts` for why that matters.
 */
export type CellValue = string | number | boolean;

/**
 * The only thing a read needs from Sheets: the whole tab, as raw rows,
 * header included. Whole-tab reads match the KS-52 spike's recommendation —
 * bounds round trips to a small constant per page render instead of scaling
 * with row count.
 *
 * Contract: `rows[0]` must be the sheet's actual row 1 (the header), with no
 * skipped title rows or range offset — `SheetRowError` messages compute the
 * sheet row an admin would see as `index + 2`, which only holds if this
 * invariant does.
 */
export interface SheetsReader {
  getTabValues(tabName: string): Promise<string[][]>;
}

/**
 * Writes, deliberately whole-row only.
 *
 * There is no cell-level write and there will not be one. The Sheets API has
 * no compare-and-swap (docs/data-layer.md §4), so the only way a failed run
 * is safe to re-run is if re-applying a write is idempotent — which holds for
 * "put this row in this state" and does not hold for "change this one cell".
 */
export interface SheetsWriter {
  /** Adds a row after the tab's existing data. */
  appendRow(tabName: string, values: CellValue[]): Promise<void>;
  /**
   * Overwrites one existing row. `rowNumber` is the 1-indexed row an admin
   * sees in the sheet, so the header is row 1 and data starts at row 2.
   */
  updateRow(tabName: string, rowNumber: number, values: CellValue[]): Promise<void>;
}

/**
 * Split rather than one interface because the capability is worth stating in
 * a signature: anything that takes a `SheetsReader` provably cannot write,
 * and that is the more common case.
 */
export interface SheetsClient extends SheetsReader, SheetsWriter {}
