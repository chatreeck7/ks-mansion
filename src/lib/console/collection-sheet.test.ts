import { describe, expect, it } from 'vitest';
import { makeBill, makePayment, makeRoom } from '@/lib/test-support/fixtures';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import {
  collectionColumns,
  collectionDays,
  collectionSheetFor,
  toCollectionGroups,
} from './collection-sheet';

/** Issued 26 มี.ค. 2568, due 10 เม.ย. — 16 days inclusive. */
const CYCLE = cycleIssuedIn(2025, 2);

const ROOMS = [
  makeRoom({ id: '101', label: '101', floor: 1 }),
  makeRoom({ id: '102', label: '102', floor: 1 }),
  makeRoom({ id: '201', label: '201', floor: 2 }),
];

const BILLS = [
  makeBill({ id: 'b-101', roomId: '101', cycle: CYCLE.id }),
  makeBill({ id: 'b-102', roomId: '102', cycle: CYCLE.id }),
];

const sheet = (payments = [] as ReturnType<typeof makePayment>[], bills = BILLS) =>
  collectionSheetFor(CYCLE, bills, payments, ROOMS);

describe('collectionDays', () => {
  /**
   * The window is the paper's own columns — `26 27 … 10`, both ends
   * inclusive — not an interpretation of them.
   */
  it('runs from the issue date to the due date, both inclusive', () => {
    const days = collectionDays(CYCLE);

    expect(days).toHaveLength(16);
    expect(days[0]).toMatchObject({ dayOfMonth: 26, key: '2025-03-26' });
    expect(days.at(-1)).toMatchObject({ dayOfMonth: 10, key: '2025-04-10' });
  });

  it('crosses the month boundary without skipping a day', () => {
    expect(collectionDays(CYCLE).map((d) => d.dayOfMonth)).toEqual([
      26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  /**
   * Out of February the window is three days shorter, which is why it is
   * generated rather than a fixed sixteen: 26–28 กุมภาพันธ์ is three days,
   * not six, and 1–10 มีนาคม is the other ten.
   */
  it('is shorter out of a short month', () => {
    const short = collectionDays(cycleIssuedIn(2025, 1));

    expect(short).toHaveLength(13);
    expect(short.map((d) => d.dayOfMonth)).toEqual([26, 27, 28, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  /** And a day longer in a leap February, for the same reason. */
  it('picks up 29 กุมภาพันธ์ in a leap year', () => {
    expect(collectionDays(cycleIssuedIn(2024, 1)).map((d) => d.dayOfMonth)).toContain(29);
  });

  it('names the month only where it turns, so the numerals stay readable', () => {
    const labelled = collectionDays(CYCLE).filter((d) => d.monthLabel !== null);

    expect(labelled.map((d) => [d.dayOfMonth, d.monthLabel])).toEqual([
      [26, 'มี.ค.'],
      [1, 'เม.ย.'],
    ]);
  });
});

describe('collectionSheetFor', () => {
  it('puts a payment in the cell for the day it arrived', () => {
    const built = sheet([
      makePayment({ id: 'p-1', billId: 'b-101', amount: 1000, paidOn: new Date(2025, 2, 28) }),
    ]);
    const row = built.rows.find((r) => r.roomId === '101')!;

    expect(row.byDay.get('2025-03-28')).toBe(1000);
    expect(row.byDay.size).toBe(1);
  });

  /** แบ่งจ่าย: a bill settled across the fortnight fills more than one cell. */
  it('keeps instalments in their own days rather than summing them into one', () => {
    const built = sheet([
      makePayment({ id: 'p-1', billId: 'b-101', amount: 1000, paidOn: new Date(2025, 2, 28) }),
      makePayment({ id: 'p-2', billId: 'b-101', amount: 1636, paidOn: new Date(2025, 3, 4) }),
    ]);
    const row = built.rows.find((r) => r.roomId === '101')!;

    expect(row.byDay.get('2025-03-28')).toBe(1000);
    expect(row.byDay.get('2025-04-04')).toBe(1636);
    expect(row.settlement.outstanding).toBe(0);
  });

  it('adds two payments that landed on the same day into one cell', () => {
    const built = sheet([
      makePayment({ id: 'p-1', billId: 'b-101', amount: 600, paidOn: new Date(2025, 2, 28) }),
      makePayment({ id: 'p-2', billId: 'b-101', amount: 400, paidOn: new Date(2025, 2, 28) }),
    ]);

    expect(built.rows.find((r) => r.roomId === '101')!.byDay.get('2025-03-28')).toBe(1000);
  });

  /**
   * The paper has no column for a late payment, and that is the problem
   * rather than the answer: money that arrived on the 12th is late, not
   * imaginary, and dropping it would show a balance the tenant has settled.
   */
  it('keeps a payment from outside the window instead of losing it', () => {
    const built = sheet([
      makePayment({ id: 'p-late', billId: 'b-101', amount: 2636, paidOn: new Date(2025, 3, 12) }),
    ]);
    const row = built.rows.find((r) => r.roomId === '101')!;

    expect(row.byDay.size).toBe(0);
    expect(row.outsideWindow).toBe(2636);
    expect(row.settlement.outstanding).toBe(0);
    expect(built.collected).toBe(2636);
  });

  it('ignores a payment against another bill', () => {
    const built = sheet([
      makePayment({ id: 'p-1', billId: 'b-102', amount: 500, paidOn: new Date(2025, 2, 28) }),
    ]);

    expect(built.rows.find((r) => r.roomId === '101')!.settlement.paid).toBe(0);
    expect(built.rows.find((r) => r.roomId === '102')!.settlement.paid).toBe(500);
  });

  it('ignores a voided payment, as settle does', () => {
    const built = sheet([
      makePayment({
        id: 'p-void', billId: 'b-101', amount: 2636,
        paidOn: new Date(2025, 2, 28), archived: true,
      }),
    ]);
    const row = built.rows.find((r) => r.roomId === '101')!;

    expect(row.byDay.size).toBe(0);
    expect(row.settlement.paid).toBe(0);
  });

  it('reads in walking order, the order the building is collected in', () => {
    const shuffled = [BILLS[1]!, BILLS[0]!];
    expect(sheet([], shuffled).rows.map((r) => r.roomId)).toEqual(['101', '102']);
  });

  it('has no row for a room with no bill this cycle', () => {
    // 201 is in the registry and was not billed — a vacant room is not on
    // the paper sheet either.
    expect(sheet().rows.some((r) => r.roomId === '201')).toBe(false);
  });

  it('totals what was billed, collected and is still owed', () => {
    const built = sheet([
      makePayment({ id: 'p-1', billId: 'b-101', amount: 2636, paidOn: new Date(2025, 2, 26) }),
      makePayment({ id: 'p-2', billId: 'b-102', amount: 1000, paidOn: new Date(2025, 3, 1) }),
    ]);

    expect(built).toMatchObject({ billed: 5272, collected: 3636, outstanding: 1636 });
  });
});

describe('the rendered sheet', () => {
  it('has a column per day, between the bill total and the running figures', () => {
    const built = sheet();
    const keys = collectionColumns(built).map((c) => c.key);

    expect(keys.slice(0, 2)).toEqual(['room', 'due']);
    expect(keys.slice(2, 18)).toEqual(built.days.map((d) => d.key));
    expect(keys.slice(18)).toEqual(['paid', 'outstanding', 'note']);
  });

  /**
   * An empty column on every ordinary sheet is a column that stops being
   * read, so นอกช่วง only appears when something is actually out there.
   */
  it('leaves out นอกช่วง when every payment landed in the window', () => {
    const built = sheet([
      makePayment({ id: 'p-1', billId: 'b-101', amount: 100, paidOn: new Date(2025, 2, 27) }),
    ]);

    expect(collectionColumns(built).map((c) => c.key)).not.toContain('outside');
  });

  it('adds นอกช่วง as soon as one payment is outside it', () => {
    const built = sheet([
      makePayment({ id: 'p-late', billId: 'b-101', amount: 100, paidOn: new Date(2025, 3, 12) }),
    ]);

    expect(collectionColumns(built).map((c) => c.key)).toContain('outside');
  });

  /**
   * Blank, not an em dash. `formatFigure(null)` is right in a narrow ledger
   * and wrong across sixteen columns — a wall of dashes is what the eye has
   * to look past to find the one cell with a number in it.
   */
  it('renders a day with no payment as blank rather than a dash', () => {
    const built = sheet([
      makePayment({ id: 'p-1', billId: 'b-101', amount: 1000, paidOn: new Date(2025, 2, 28) }),
    ]);
    const row = toCollectionGroups(built, 'รอบ')[0]!.rows.find((r) => r.id === 'b-101')!;

    expect(row.cells['2025-03-27']).toEqual({ kind: 'text', value: '' });
    expect(row.cells['2025-03-28']).toEqual({ kind: 'figure', value: 1000 });
  });

  it('supplies a cell for every column, which LedgerTable requires', () => {
    const built = sheet([
      makePayment({ id: 'p-late', billId: 'b-101', amount: 100, paidOn: new Date(2025, 3, 12) }),
    ]);
    const columns = collectionColumns(built);

    for (const row of toCollectionGroups(built, 'รอบ')[0]!.rows) {
      for (const column of columns) {
        expect(row.cells[column.key], `${row.id} is missing "${column.key}"`).toBeDefined();
      }
    }
  });

  /** ค้าง is an admin's assertion (KS-22), printed as written. */
  it('carries the arrears note through as text', () => {
    const annotated = [makeBill({ id: 'b-101', roomId: '101', cycle: CYCLE.id,
                                  arrearsNote: 'ยอดค้าง 4,327' })];
    const row = toCollectionGroups(sheet([], annotated), 'รอบ')[0]!.rows[0]!;

    expect(row.cells.note).toMatchObject({ value: 'ยอดค้าง 4,327' });
  });

  it('shows a settled row as zero owing rather than as blank', () => {
    const built = sheet([
      makePayment({ id: 'p-1', billId: 'b-101', amount: 2636, paidOn: new Date(2025, 2, 26) }),
    ]);
    const row = toCollectionGroups(built, 'รอบ')[0]!.rows.find((r) => r.id === 'b-101')!;

    expect(row.cells.outstanding).toEqual({ kind: 'figure', value: 0 });
  });
});
