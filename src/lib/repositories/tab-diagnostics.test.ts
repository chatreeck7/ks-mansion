import { describe, expect, it } from 'vitest';
import { createInMemorySheets } from './memory/in-memory-sheets';
import { TENANTS_TAB } from './sheets/sheets-tenant-repository';
import { diagnoseTab } from './tab-diagnostics';

const HEADER = [
  'id', 'full_name', 'nickname', 'id_card_last4', 'phone',
  'occupation', 'evaluation_grade', 'note',
  'address_house_no', 'address_road', 'address_subdistrict',
  'address_district', 'address_province', 'address_postcode', 'archived',
];

/** A row keyed by column name, so a test states only what it is about. */
function row(cells: Record<string, string> = {}): string[] {
  return HEADER.map((column) => cells[column] ?? '');
}

function sheetOf(rows: string[][], header: string[] = HEADER) {
  return createInMemorySheets({ tenants: [header, ...rows] });
}

describe('diagnoseTab', () => {
  it('counts the rows a tab will actually try to read', async () => {
    const d = await diagnoseTab(sheetOf([row({ id: 't-1', full_name: 'ก' })]), TENANTS_TAB);

    expect(d).toMatchObject({ tab: 'tenants', dataRows: 1, nonBlankRows: 1 });
    expect(d.skipped).toEqual([]);
  });

  /**
   * The case the card came from. `tenants: 1` was correct, but it was equally
   * consistent with rows being silently ignored, and the page could not tell
   * anyone which.
   */
  it('reports a row that holds content but is being skipped', async () => {
    const d = await diagnoseTab(
      sheetOf([
        row({ id: 't-1', full_name: 'ก' }),
        // Someone typed a tenant in but never gave them an id or a name.
        row({ phone: '080-000-0000', occupation: 'ค้าขาย' }),
      ]),
      TENANTS_TAB,
    );

    expect(d.nonBlankRows).toBe(1);
    expect(d.ignoredWithContent).toHaveLength(1);
    // Row 3: header is row 1, the good tenant is row 2.
    expect(d.ignoredWithContent[0]).toEqual({
      rowNumber: 3,
      populated: ['phone', 'occupation'],
    });
  });

  /**
   * A spacer row is normal in a hand-kept sheet. Counting it as a problem
   * would make the report noisy enough to stop being read, which is the only
   * way a diagnostic actually fails.
   */
  it('separates an empty spacer row from a row that is being ignored', async () => {
    const d = await diagnoseTab(
      sheetOf([row({ id: 't-1', full_name: 'ก' }), row(), row({ phone: '080' })]),
      TENANTS_TAB,
    );

    expect(d.skipped).toHaveLength(2);
    expect(d.ignoredWithContent).toHaveLength(1);
    expect(d.ignoredWithContent[0]!.rowNumber).toBe(4);
  });

  /** Names the column, never what is in it — the tab holds personal data. */
  it('reports which columns hold something, not the values in them', async () => {
    const d = await diagnoseTab(
      sheetOf([row({ phone: '080-123-4567', id_card_last4: '1234' })]),
      TENANTS_TAB,
    );

    const reported = JSON.stringify(d);
    expect(reported).toContain('phone');
    expect(reported).not.toContain('080-123-4567');
    expect(reported).not.toContain('1234');
  });

  /**
   * A typo'd header is not a missing column — the contract's own name is
   * still absent, so the read fails first. What this catches is the opposite:
   * an extra column nobody has told the console about, which is where a
   * stray value hides.
   */
  it('lists header columns the contract does not know about', async () => {
    const d = await diagnoseTab(
      sheetOf([row({ id: 't-1', full_name: 'ก' }).concat('x')], HEADER.concat('line_notes')),
      TENANTS_TAB,
    );

    expect(d.unknownColumns).toEqual(['line_notes']);
  });

  /** So the page can name them, instead of saying "the identity columns". */
  it('names the columns whose emptiness causes a skip', async () => {
    const d = await diagnoseTab(sheetOf([row({ id: 't-1', full_name: 'ก' })]), TENANTS_TAB);
    expect(d.identityColumns).toEqual(['id', 'full_name']);
  });

  it('says nothing is skipped when nothing is', async () => {
    const d = await diagnoseTab(
      sheetOf([row({ id: 't-1', full_name: 'ก' }), row({ id: 't-2', full_name: 'ข' })]),
      TENANTS_TAB,
    );

    expect(d).toMatchObject({ dataRows: 2, nonBlankRows: 2, unknownColumns: [] });
    expect(d.ignoredWithContent).toEqual([]);
  });

  /** A tab whose header does not parse has no rows to say anything about. */
  it('propagates a header failure rather than reporting zero rows', async () => {
    const bare = createInMemorySheets({ tenants: [['id', 'full_name'], ['t-1', 'ก']] });

    await expect(diagnoseTab(bare, TENANTS_TAB)).rejects.toThrow(/missing required columns/);
  });
});
