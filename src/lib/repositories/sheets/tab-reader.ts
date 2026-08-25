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
  columnIndex: Record<string, number>;
  dataRows: string[][];
  /**
   * True when no *required* column holds a value. A row carrying only an
   * admin's note in some optional column is not data, and must not be
   * mistaken for a corrupt record.
   */
  isBlankRow(row: string[]): boolean;
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
  requiredColumns: readonly string[],
): Promise<Tab> {
  const rows = await client.getTabValues(tabName);
  if (rows.length === 0) {
    throw new Error(`Sheets tab "${tabName}" has no header row`);
  }

  const [header, ...dataRows] = rows;
  const columnIndex = indexHeader(tabName, header!);
  for (const column of requiredColumns) {
    if (!(column in columnIndex)) {
      throw new Error(`Sheets tab "${tabName}" is missing required column "${column}"`);
    }
  }

  return {
    tabName,
    columnIndex,
    dataRows,
    isBlankRow: (row) =>
      requiredColumns.every((column) => (row[columnIndex[column]] ?? '').trim() === ''),
  };
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
