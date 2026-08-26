import type { CellValue } from './sheets-client';
import { cellValue, type Tab } from './tab-reader';

/**
 * The write counterpart to tab-reader: turns named field values into a full
 * sheet row, addressed by header name rather than by position.
 *
 * The read path's whole premise is that a cell is found by its column *name*,
 * because admins reorder and insert columns. A write has to honour the same
 * rule or it breaks the guarantee from the other side — building a row in the
 * contract's declared order and hoping the sheet matches would put every
 * value one column off the first time someone drags a column, and unlike a
 * bad read, a bad write cannot be undone by fixing the code.
 */

/** Field values keyed by sheet column name. */
export type RowValues = Record<string, CellValue>;

/**
 * Builds the row to write.
 *
 * `existing` is the current contents of the row for an update, or `null` for
 * a new one. Cells not named in `values` are **carried across unchanged**:
 * the console owns some columns and the admin owns others (`type`, `detail`,
 * and whatever gets added next), and writing only the columns the model knows
 * about would blank the rest. That is the difference between "update this
 * record" and "replace this record with what the console happens to model".
 */
export function buildRow(tab: Tab, existing: string[] | null, values: RowValues): CellValue[] {
  const width = Math.max(tab.header.length, existing?.length ?? 0);
  const row: CellValue[] = Array.from({ length: width }, (_, i) => existing?.[i] ?? '');

  for (const [column, value] of Object.entries(values)) {
    const index = tab.columnIndex[column];
    if (index === undefined) {
      // Silently dropping this would look like a successful save that lost a
      // field — the failure would surface later as missing data with no
      // record of where it went.
      throw new Error(
        `Sheets tab "${tab.tabName}" has no column "${column}" to write to. ` +
          `Header: ${tab.header.filter(Boolean).join(', ')}`,
      );
    }
    row[index] = value;
  }

  return row;
}

/**
 * The next id for a tab, as `<prefix><zero-padded number>` — `t-001`, `l-014`.
 *
 * Readable rather than opaque, deliberately: the sheet is opened and edited by
 * people, and a lease showing `l-014` is something an admin can match against
 * paperwork in a way `l-8Fq2xR` is not. That readability is most of the reason
 * this project chose Sheets at all.
 *
 * The cost is that "max + 1" is racy — two writes in the same instant would
 * both pick the same number. Accepted, because the read path already fails
 * loudly on a duplicate id and names both rows, so a collision surfaces as an
 * error rather than as silent conflation; and at single-admin scale (see
 * docs/admin-collaboration.md, "What this does not solve") the race does not
 * arise. Revisit alongside the concurrency question, not before.
 *
 * Ids an admin typed by hand that do not fit the pattern are ignored for the
 * numbering but still occupy their value, so the caller must check the id is
 * free before writing.
 */
export function nextId(tab: Tab, idColumn: string, prefix: string, pad = 3): string {
  let highest = 0;
  for (const row of tab.dataRows) {
    if (tab.isBlankRow(row)) continue;
    const id = cellValue(tab, row, idColumn);
    if (!id.startsWith(prefix)) continue;

    const suffix = id.slice(prefix.length);
    // Digits only: 'l-14b' is not 14, and treating it as such would hand the
    // next record an id that is already taken.
    if (!/^\d+$/.test(suffix)) continue;
    highest = Math.max(highest, Number(suffix));
  }

  return `${prefix}${String(highest + 1).padStart(pad, '0')}`;
}
