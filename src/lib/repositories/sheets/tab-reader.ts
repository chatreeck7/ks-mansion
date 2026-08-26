import type { SheetsClient } from './sheets-client';

/**
 * Shared read-and-validate scaffolding for any Sheets-backed tab.
 *
 * Extracted when the second repository (tenants) arrived, which is the point
 * the KS-54 review deferred this decision to — with one implementation it was
 * speculation; with two the duplication is real and the shape is known.
 * Everything here is entity-agnostic; per-entity parsing stays with its
 * repository.
 */

export class SheetRowError extends Error {
  constructor(tabName: string, rowNumber: number, reason: string) {
    super(`Sheets tab "${tabName}", row ${rowNumber}: ${reason}`);
    this.name = 'SheetRowError';
  }
}

export interface Tab {
  tabName: string;
  /**
   * The header row as it stands in the sheet, in sheet order. Writes need it
   * to build a row of the right width in the right order — a write that
   * assumed the contract's own column order would land every value in the
   * wrong cell the moment an admin reorders a column, which is the exact
   * corruption reading-by-name exists to prevent.
   */
  header: string[];
  columnIndex: Record<string, number>;
  dataRows: string[][];
  /**
   * True when no *identity* column holds a value. A row carrying only an
   * admin's note in some other column is not data, and must not be mistaken
   * for a corrupt record.
   */
  isBlankRow(row: string[]): boolean;
}

/**
 * What a tab's header must provide, and what makes a row a record.
 *
 * These started as one list and had to be split: a tab can legitimately
 * declare a column whose *value* is optional (`note`, `occupation`, the
 * address parts) while its *presence* is still mandatory — a header typo
 * there would otherwise make every row silently read as blank. Folding those
 * into one list forced a choice between not verifying the header and treating
 * a stray note row as a corrupt record.
 */
/**
 * A tab and the contract it is read under, together.
 *
 * Exists so something outside a repository — the health page — can inspect a
 * tab without being handed the contract to keep in step separately. The
 * repository stays the one place that decides what its own tab looks like.
 */
export interface TabDescriptor {
  tabName: string;
  contract: TabContract;
}

export interface TabContract {
  /** Columns whose absence from the header row is a schema error. */
  columns: readonly string[];
  /**
   * The subset that makes a row a record — a row empty in all of them is
   * blank and skipped. Defaults to every column, which is right for a tab
   * where nothing is optional.
   */
  identity?: readonly string[];
}

/**
 * Maps header names to positions, so callers never address a cell by index.
 * Throws on a duplicate name: a silent index collision would quietly read
 * every row from the wrong column, which is the corruption this whole layer
 * exists to prevent.
 */
function indexHeader(tabName: string, header: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  header.forEach((name, i) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed in index) {
      throw new Error(`Sheets tab "${tabName}" has a duplicate column header "${trimmed}"`);
    }
    index[trimmed] = i;
  });
  return index;
}

/** Reads a whole tab and verifies its header contract before any row is parsed. */
export async function readTab(
  client: SheetsClient,
  tabName: string,
  contract: TabContract,
): Promise<Tab> {
  const rows = await client.getTabValues(tabName);
  if (rows.length === 0) {
    throw new Error(`Sheets tab "${tabName}" has no header row`);
  }

  const [header, ...dataRows] = rows;
  const columnIndex = indexHeader(tabName, header!);

  // Every missing column at once, not the first. This used to throw on the
  // first name it could not find, which made a sheet short several columns
  // into one fix-and-recheck round per column — and each round is a person
  // going back to a spreadsheet, not a fast loop.
  const missing = contract.columns.filter((column) => !(column in columnIndex));
  if (missing.length > 0) {
    const label = missing.length === 1 ? 'column' : 'columns';
    throw new Error(
      `Sheets tab "${tabName}" is missing required ${label} ${missing.map((c) => `"${c}"`).join(', ')}`,
    );
  }

  const identity = contract.identity ?? contract.columns;

  return {
    tabName,
    header: header!,
    columnIndex,
    dataRows,
    isBlankRow: (row) =>
      identity.every((column) => (row[columnIndex[column]] ?? '').trim() === ''),
  };
}

/**
 * The sheet row number an admin would see for a data row: 1-indexed, plus the
 * header. Every caller was computing `i + 2` inline; a write that gets this
 * wrong by one overwrites its neighbour, so it is worth having in one place.
 */
export function sheetRowNumber(dataRowIndex: number): number {
  return dataRowIndex + 2;
}

/** A located row, with the sheet row number needed to write it back. */
export interface FoundRow {
  row: string[];
  rowNumber: number;
}

/**
 * Finds the one row whose `column` holds `value`, skipping blanks.
 *
 * Writes must re-find their row by id immediately before writing rather than
 * remembering a row number from an earlier read: there is no compare-and-swap
 * in the Sheets API, and an admin inserting a row between the two shifts
 * every number below it. Re-finding narrows that window to the round trip
 * instead of the length of a user's session.
 */
export function findRow(tab: Tab, column: string, value: string): FoundRow | null {
  for (const [i, row] of tab.dataRows.entries()) {
    if (tab.isBlankRow(row)) continue;
    if (cellValue(tab, row, column) === value) {
      return { row, rowNumber: sheetRowNumber(i) };
    }
  }
  return null;
}

/** A trimmed cell, or '' when the column is absent from this row. */
export function cellValue(tab: Tab, row: string[], column: string): string {
  return (row[tab.columnIndex[column]] ?? '').trim();
}

/** A cell that must carry a value; throws naming the tab, row and column. */
export function requireCell(tab: Tab, row: string[], rowNumber: number, column: string): string {
  const value = cellValue(tab, row, column);
  if (!value) throw new SheetRowError(tab.tabName, rowNumber, `missing "${column}"`);
  return value;
}

/**
 * A numeric cell, tolerating the thousands separators an admin naturally
 * types — and that Sheets itself inserts once a column is number-formatted.
 *
 * That formatting is not hypothetical: `rent_rate` in `KS_Mansion_DB` arrives
 * as `"2,200"`, because the API returns the *formatted* value. Parsing with
 * a bare `Number()` turns every one of those into `NaN`, so this has to be
 * the shared path rather than something each repository remembers to do.
 */
export function numberCell(tab: Tab, row: string[], rowNumber: number, column: string): number {
  const raw = cellValue(tab, row, column);
  const value = Number(raw.replace(/,/g, ''));
  if (raw === '' || !Number.isFinite(value)) {
    throw new SheetRowError(tab.tabName, rowNumber, `"${column}" is not a number: "${raw}"`);
  }
  return value;
}

/** Same, but a genuinely blank cell reads as null rather than failing. */
export function optionalNumberCell(
  tab: Tab,
  row: string[],
  rowNumber: number,
  column: string,
): number | null {
  return cellValue(tab, row, column) === '' ? null : numberCell(tab, row, rowNumber, column);
}

/**
 * A boolean cell. Blank throws rather than reading as false: "nobody filled
 * this in" and "this room has no meter" are different facts, and only one of
 * them should quietly drop a room out of the meter round.
 */
export function booleanCell(tab: Tab, row: string[], rowNumber: number, column: string): boolean {
  const raw = cellValue(tab, row, column);
  const normalized = raw.toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new SheetRowError(
    tab.tabName,
    rowNumber,
    `"${column}" must be "true" or "false", got "${raw}"`,
  );
}

/**
 * A boolean cell where blank genuinely means "not recorded".
 *
 * Distinct from `booleanCell`, which rejects a blank. Use this only where the
 * absence of a value is itself a fact worth carrying — an appliance nobody
 * has surveyed — rather than where a blank is an admin's oversight. Reaching
 * for it to make a stubborn column stop failing is how "nobody filled this
 * in" quietly becomes "false".
 *
 * A caller that genuinely wants a default says so at its own call site with
 * `?? false`, which keeps that decision visible where the reasoning for it
 * lives rather than buried in an argument here.
 */
export function nullableBooleanCell(
  tab: Tab,
  row: string[],
  rowNumber: number,
  column: string,
): boolean | null {
  return cellValue(tab, row, column) === '' ? null : booleanCell(tab, row, rowNumber, column);
}

/** A cell restricted to a known set of values; anything else names the row. */
export function enumCell<T extends string>(
  tab: Tab,
  row: string[],
  rowNumber: number,
  column: string,
  allowed: readonly T[],
): T {
  const raw = cellValue(tab, row, column);
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new SheetRowError(
    tab.tabName,
    rowNumber,
    `"${column}" must be one of ${allowed.map((v) => `"${v}"`).join(', ')}, got "${raw}"`,
  );
}

/** Same, but a genuinely blank cell reads as null rather than failing. */
export function optionalEnumCell<T extends string>(
  tab: Tab,
  row: string[],
  rowNumber: number,
  column: string,
  allowed: readonly T[],
): T | null {
  return cellValue(tab, row, column) === ''
    ? null
    : enumCell(tab, row, rowNumber, column, allowed);
}
