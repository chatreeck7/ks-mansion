import type { CellValue, SheetsClient } from '@/lib/repositories/sheets/sheets-client';

/**
 * An in-memory stand-in for a spreadsheet. Not imported by anything that
 * ships.
 *
 * Read tests used to build an ad-hoc `{ async getTabValues() { … } }` per
 * file, which was fine while the client was read-only. Write tests need the
 * other half: something that *records* what was written so a test can assert
 * on the resulting sheet rather than on the call arguments. Asserting on
 * arguments would pass for a write that lands in the wrong row, which is the
 * bug class most worth catching here.
 *
 * It mimics the two behaviours of the real client that repositories are
 * written against: every cell reads back as a **string** (the API returns
 * formatted values), and rows stay ragged rather than being padded.
 */
export interface FakeSheets extends SheetsClient {
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

export function createFakeSheets(tabs: Record<string, unknown[][]>): FakeSheets {
  const state = new Map<string, string[][]>(
    Object.entries(tabs).map(([name, rows]) => [name, rows.map((row) => row.map(asCell))]),
  );
  let writes = 0;

  function tab(tabName: string): string[][] {
    const rows = state.get(tabName);
    if (!rows) throw new Error(`Fake sheet has no tab "${tabName}".`);
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
          `Fake sheet tab "${tabName}" has ${rows.length} rows; cannot update row ${rowNumber}.`,
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
