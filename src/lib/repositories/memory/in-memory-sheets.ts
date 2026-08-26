import type { CellValue, SheetsClient } from '../sheets/sheets-client';

/**
 * An in-memory stand-in for a spreadsheet.
 *
 * It mimics the two behaviours of the real client that repositories are
 * written against: every cell reads back as a **string** (the API returns
 * formatted values), and rows stay ragged rather than being padded. Write
 * tests need the other half too — something that *records* what was written,
 * so a test can assert on the resulting sheet rather than on the call
 * arguments. Asserting on arguments would pass for a write that lands in the
 * wrong row, which is the bug class most worth catching.
 *
 * **This ships** (KS-69), which it did not use to. Backing the local-dev
 * store with it is what makes the seed store run the *real* repository code
 * — the same parsing, the same validation, the same refusal to write a row
 * that could not be read back. Parity with production then holds by
 * construction rather than by two implementations being kept in step by
 * hand, which is what they were not.
 */
export interface InMemorySheets extends SheetsClient {
  /** The tab as it now stands, in the shape `getTabValues` would return. */
  rowsOf(tabName: string): string[][];
  /** How many write calls have landed, for asserting a single round trip. */
  writeCount(): number;
}

function asCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

export function createInMemorySheets(tabs: Record<string, unknown[][]>): InMemorySheets {
  const state = new Map<string, string[][]>(
    Object.entries(tabs).map(([name, rows]) => [name, rows.map((row) => row.map(asCell))]),
  );
  let writes = 0;

  function tab(tabName: string): string[][] {
    const rows = state.get(tabName);
    if (!rows) throw new Error(`In-memory sheet has no tab "${tabName}".`);
    return rows;
  }

  return {
    async getTabValues(tabName) {
      // A copy, so a caller mutating what it read cannot reach back into the
      // sheet — the real client hands over a fresh parse every time.
      return tab(tabName).map((row) => [...row]);
    },

    async appendRow(tabName, values: CellValue[]) {
      writes += 1;
      tab(tabName).push(values.map(asCell));
    },

    async updateRow(tabName, rowNumber, values: CellValue[]) {
      // Mirrors the real client's guards rather than trusting callers to be
      // well-behaved: a test that writes over the header should fail here
      // too, not only in production.
      if (!Number.isInteger(rowNumber) || rowNumber <= 1) {
        throw new Error(`Refusing to write row ${rowNumber} of tab "${tabName}".`);
      }
      if (values.length === 0) {
        throw new Error(`Refusing to write an empty row to tab "${tabName}".`);
      }

      writes += 1;
      const rows = tab(tabName);
      if (rowNumber - 1 >= rows.length) {
        throw new Error(
          `In-memory sheet tab "${tabName}" has ${rows.length} rows; cannot update row ${rowNumber}.`,
        );
      }
      rows[rowNumber - 1] = values.map(asCell);
    },

    rowsOf(tabName) {
      return tab(tabName).map((row) => [...row]);
    },

    writeCount() {
      return writes;
    },
  };
}
