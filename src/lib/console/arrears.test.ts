import { describe, expect, it } from 'vitest';
import type { Bill } from '@/lib/models/bill';
import type { LedgerInputCell } from '@/lib/models/ledger';
import {
  ARREARS_COLUMNS,
  arrearsFieldName,
  arrearsUpdatesFromForm,
  toArrearsGroups,
} from './arrears';

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'b-001',
    roomId: '101',
    leaseId: 'l-001',
    cycle: '2025-03',
    issueDate: new Date(2025, 2, 26),
    dueDate: new Date(2025, 3, 10),
    rentAmount: 2200,
    electricityAmount: 336,
    waterAmount: 100,
    arrearsNote: null,
    archived: false,
    ...overrides,
  };
}

const BILLS = [
  makeBill({ id: 'b-001', roomId: '101' }),
  makeBill({ id: 'b-002', roomId: '102', arrearsNote: 'ยอดค้าง 1,169' }),
];

function form(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

describe('toArrearsGroups', () => {
  it('supplies a cell for every declared column', () => {
    for (const row of toArrearsGroups(BILLS, 'รอบ')[0]!.rows) {
      for (const column of ARREARS_COLUMNS) {
        expect(row.cells[column.key], `${row.id} is missing "${column.key}"`).toBeDefined();
      }
    }
  });

  it('shows the bill total beside the note being written about it', () => {
    expect(toArrearsGroups(BILLS, 'รอบ')[0]!.rows[0]!.cells.total).toEqual({
      kind: 'figure',
      value: 2636,
    });
  });

  it('pre-fills an existing note and leaves an absent one empty', () => {
    const rows = toArrearsGroups(BILLS, 'รอบ')[0]!.rows;

    expect((rows[0]!.cells.note as LedgerInputCell).value).toBe('');
    expect((rows[1]!.cells.note as LedgerInputCell).value).toBe('ยอดค้าง 1,169');
  });

  it('names each field by its bill, and each label by its room', () => {
    const note = toArrearsGroups(BILLS, 'รอบ')[0]!.rows[1]!.cells.note as LedgerInputCell;

    expect(note.name).toBe('arrears:b-002');
    expect(note.label).toContain('102');
  });

  it('puts back what was typed when a submission comes back', () => {
    const submitted = form({ 'arrears:b-001': 'ค้างประกัน 1,000' });
    const rows = toArrearsGroups(BILLS, 'รอบ', submitted)[0]!.rows;

    expect((rows[0]!.cells.note as LedgerInputCell).value).toBe('ค้างประกัน 1,000');
  });
});

describe('arrearsUpdatesFromForm', () => {
  it('writes only the note that changed', () => {
    const updates = arrearsUpdatesFromForm(
      BILLS,
      form({ 'arrears:b-001': 'ยอดค้าง 500', 'arrears:b-002': 'ยอดค้าง 1,169' }),
    );

    expect(updates).toEqual([{ billId: 'b-001', note: 'ยอดค้าง 500' }]);
  });

  it('writes nothing when nothing moved', () => {
    expect(
      arrearsUpdatesFromForm(BILLS, form({ 'arrears:b-002': 'ยอดค้าง 1,169' })),
    ).toEqual([]);
  });

  /**
   * The opposite of the water screen's rule, and deliberately: an occupant
   * count is always true of a room, so a blank one is a deleted fact. A note
   * is only there while it applies, so emptying it is how an admin says the
   * ค้าง is settled.
   */
  it('treats a cleared note as settled, not as an error', () => {
    expect(arrearsUpdatesFromForm(BILLS, form({ 'arrears:b-002': '' }))).toEqual([
      { billId: 'b-002', note: null },
    ]);
  });

  it('trims, so whitespace is not a note', () => {
    expect(arrearsUpdatesFromForm(BILLS, form({ 'arrears:b-002': '   ' }))).toEqual([
      { billId: 'b-002', note: null },
    ]);
    expect(
      arrearsUpdatesFromForm(BILLS, form({ 'arrears:b-001': '  ยอดค้าง 500  ' })),
    ).toEqual([{ billId: 'b-001', note: 'ยอดค้าง 500' }]);
  });

  /**
   * The two shapes the real หมายเหตุ column holds are different facts —
   * unpaid rent against an unpaid deposit — which is the argument for text
   * over an amount. Both must survive verbatim.
   */
  it('keeps whatever sentence the admin wrote', () => {
    for (const note of ['ยอดค้าง 4,327', 'ค้างประกัน 1,000', 'จ่ายแล้วบางส่วน รอโอนที่เหลือ']) {
      expect(arrearsUpdatesFromForm(BILLS, form({ 'arrears:b-001': note }))).toEqual([
        { billId: 'b-001', note },
      ]);
    }
  });

  it('ignores a bill the form did not carry', () => {
    expect(arrearsUpdatesFromForm(BILLS, form({}))).toEqual([]);
  });

  it('addresses a bill by id, never by position', () => {
    // A bill archived between render and submit would shift every index.
    expect(arrearsFieldName(BILLS[1]!)).toBe('arrears:b-002');
  });
});
