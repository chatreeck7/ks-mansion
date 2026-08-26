import type { SheetsClient } from './sheets/sheets-client';
import { cellValue, readTab, sheetRowNumber, type TabDescriptor } from './sheets/tab-reader';

/**
 * Which rows a tab is **not** reading, and whether that should worry anyone.
 *
 * The row count on its own only helps someone who already knows what to
 * expect. Pointing the console at the live sheet for the first time reported
 * `tenants: 1`, which was correct — no real tenants had been entered yet —
 * but was equally consistent with twenty rows being silently ignored. There
 * was no way to tell those apart from the page.
 *
 * A row is skipped when every one of its tab's `identity` columns is blank.
 * That rule is right: it stops a spacer row or a stray note from reading as a
 * corrupt record. What it also does, silently, is drop a row that has real
 * content but no `id` — which is precisely what hand-entry produces.
 *
 * **Column names only, never cell values.** The tenants tab holds names,
 * phone numbers and ID digits. Naming which columns a skipped row populates
 * is enough to go and fix it, and leaks nothing. (`SheetRowError` does quote
 * the offending value, which is right where the value *is* the fault — a
 * skipped row has no fault, it is just unseen.)
 */

export interface SkippedRow {
  /** The row number as it appears in the spreadsheet. */
  rowNumber: number;
  /**
   * Columns this row *does* hold something in. Empty means a genuinely blank
   * spacer — harmless. Non-empty means content the console cannot see, which
   * is the case worth acting on.
   */
  populated: string[];
}

export interface TabDiagnostic {
  tab: string;
  /** Rows below the header, however they read. */
  dataRows: number;
  /**
   * Rows the tab would try to parse.
   *
   * Deliberately *not* the same number the health page shows: that one comes
   * from `list`, which also drops archived records. Conflating them would
   * make an archived tenant look like a skipped row.
   */
  nonBlankRows: number;
  /** Skipped because every identity column was blank. */
  skipped: SkippedRow[];
  /**
   * Skipped rows that hold something. Separated out because "3 rows skipped"
   * blurs the harmless case into the alarming one, and only this number
   * should ever make someone go and look.
   */
  ignoredWithContent: SkippedRow[];
  /**
   * Header names the contract does not mention. Purely informational — the
   * console preserves them on write and never reads them — but a typo like
   * `occupatoin` shows up here rather than as a mysteriously empty field.
   */
  unknownColumns: string[];
  /**
   * The columns whose emptiness caused the skips, so the report can name them
   * rather than saying "the identity columns" at someone who has never read
   * the schema doc.
   */
  identityColumns: string[];
}

export async function diagnoseTab(
  client: SheetsClient,
  descriptor: TabDescriptor,
): Promise<TabDiagnostic> {
  const { tabName, contract } = descriptor;
  const tab = await readTab(client, tabName, contract);

  const skipped: SkippedRow[] = [];
  let nonBlankRows = 0;

  tab.dataRows.forEach((row, i) => {
    if (!tab.isBlankRow(row)) {
      nonBlankRows += 1;
      return;
    }

    // Report against the sheet's own header, not the contract: a column the
    // contract has never heard of is exactly where a stray value hides.
    const populated = tab.header.filter(
      (column) => column !== '' && cellValue(tab, row, column) !== '',
    );
    skipped.push({ rowNumber: sheetRowNumber(i), populated });
  });

  const known = new Set(contract.columns);

  return {
    tab: tabName,
    dataRows: tab.dataRows.length,
    nonBlankRows,
    skipped,
    ignoredWithContent: skipped.filter((row) => row.populated.length > 0),
    unknownColumns: tab.header.filter((column) => column !== '' && !known.has(column)),
    identityColumns: [...(contract.identity ?? contract.columns)],
  };
}
