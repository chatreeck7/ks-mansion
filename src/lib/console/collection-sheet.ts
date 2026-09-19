import { billTotal, type Bill } from '@/lib/models/bill';
import { type BillingCycle } from '@/lib/models/billing-cycle';
import type { LedgerCell, LedgerColumn, LedgerGroup, LedgerRow } from '@/lib/models/ledger';
import { settle, type Payment, type Settlement } from '@/lib/models/payment';
import { inWalkingOrder, type Room } from '@/lib/models/room';
import { THAI_MONTHS_SHORT } from '@/lib/format/thai';

/**
 * แบบฟอร์มเก็บเงินค่าห้อง — the collection sheet (KS-25).
 *
 * One sheet for the whole building with **a column per day of the collection
 * window**, `26 27 28 … 10`, and the amount written into the cell under the
 * day it arrived. That window is the paper's, not an interpretation of it:
 * the form prints exactly those columns, and `isCollecting` already encodes
 * the same span for the same reason.
 *
 * **This is the read side of the money, and `/console/payments` is the write
 * side.** They look at the same rows and are deliberately not one screen:
 * recording takes one date and one method for a whole session (see
 * `payment-ledger.ts`), while this answers "who has paid, and when" across
 * the fortnight — the question the paper sheet exists to answer at a glance.
 * Putting an input in every one of sixteen day cells would be a grid one
 * mis-click away from recording a payment on the wrong day.
 */

/** A day of the collection window, and the payments that landed on it. */
export interface CollectionDay {
  /** `2025-04-03`, stable and sortable — the cell key, never a label. */
  key: string;
  /** `3` — the numeral the paper column is headed with. */
  dayOfMonth: number;
  /** Shown once where the month turns, so `31 → 1` is not ambiguous. */
  monthLabel: string | null;
  date: Date;
}

/**
 * Every day from the issue date to the due date, both inclusive.
 *
 * Both ends are inclusive because the paper's columns are: money handed over
 * on the 26th is this cycle's, and money handed over on the due date is on
 * time. The run crosses a month boundary by construction, and the length
 * varies with the issue month — February's window is two days shorter than
 * March's, which is why this is generated rather than a fixed sixteen.
 */
export function collectionDays(cycle: BillingCycle): CollectionDay[] {
  const days: CollectionDay[] = [];
  const last = startOfDay(cycle.dueDate);

  for (
    let at = startOfDay(cycle.issueDate);
    at.getTime() <= last.getTime();
    at = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1)
  ) {
    const isFirstOfMonth = at.getDate() === 1;
    days.push({
      key: dayKey(at),
      dayOfMonth: at.getDate(),
      // Only where the month turns: a header reading `31 1 2` is a date
      // range nobody can read, and one reading `31 เม.ย. 1 2` is.
      monthLabel: days.length === 0 || isFirstOfMonth ? THAI_MONTHS_SHORT[at.getMonth()]! : null,
      date: at,
    });
  }

  return days;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Local-time day key. Never an ISO timestamp: the paper has no clock. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export interface CollectionRow {
  roomId: string;
  roomLabel: string;
  bill: Bill;
  settlement: Settlement;
  /** Day key → what arrived that day. Absent where nothing did. */
  byDay: Map<string, number>;
  /**
   * Money against this bill that landed outside the window.
   *
   * **The paper has no column for it and that is the problem, not the
   * answer.** A payment on the 12th is late, not imaginary, and a sheet that
   * silently dropped it would show an outstanding balance the tenant has
   * already settled. It gets its own column instead.
   */
  outsideWindow: number;
}

export interface CollectionSheet {
  cycle: BillingCycle;
  days: CollectionDay[];
  rows: CollectionRow[];
  /** What the cycle billed, in total. */
  billed: number;
  collected: number;
  outstanding: number;
}

/**
 * Builds the sheet for one cycle.
 *
 * Takes the cycle's bills rather than every bill: the paper is one sheet per
 * collection round, and a screen showing two rounds at once would be a
 * different document.
 */
export function collectionSheetFor(
  cycle: BillingCycle,
  bills: Bill[],
  payments: Payment[],
  rooms: Room[],
): CollectionSheet {
  const days = collectionDays(cycle);
  const inWindow = new Set(days.map((day) => day.key));
  const labels = new Map(rooms.map((room) => [room.id, room.label]));

  // Walking order, so the screen reads in the order the building is walked
  // and the paper is filled in — not in whatever order the sheet rows came
  // back. A room with no bill this cycle has no row: a vacant room is not on
  // the collection sheet either (see `planBillRun`).
  const order = new Map(inWalkingOrder(rooms).map((room, index) => [room.id, index]));
  const ordered = [...bills].sort(
    (a, b) => (order.get(a.roomId) ?? Infinity) - (order.get(b.roomId) ?? Infinity),
  );

  const rows = ordered.map((bill): CollectionRow => {
    const settlement = settle(bill, payments);
    const byDay = new Map<string, number>();
    let outsideWindow = 0;

    // `settle` has already dropped voided rows and payments against other
    // bills, so this only has to place what it kept.
    for (const payment of settlement.payments) {
      const key = dayKey(payment.paidOn);
      if (inWindow.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + payment.amount);
      else outsideWindow += payment.amount;
    }

    return {
      roomId: bill.roomId,
      roomLabel: labels.get(bill.roomId) ?? bill.roomId,
      bill,
      settlement,
      byDay,
      outsideWindow,
    };
  });

  return {
    cycle,
    days,
    rows,
    billed: rows.reduce((sum, row) => sum + billTotal(row.bill), 0),
    collected: rows.reduce((sum, row) => sum + row.settlement.paid, 0),
    outstanding: rows.reduce((sum, row) => sum + row.settlement.outstanding, 0),
  };
}

/** `ห้อง | ยอดบิล | 26 … 10 | นอกช่วง | รวมรับ | คงเหลือ | หมายเหตุ`. */
export function collectionColumns(sheet: CollectionSheet): LedgerColumn[] {
  const showOutside = sheet.rows.some((row) => row.outsideWindow !== 0);

  return [
    { key: 'room', header: 'ห้อง' },
    { key: 'due', header: 'ยอดบิล', align: 'right' },
    ...sheet.days.map((day): LedgerColumn => ({
      key: day.key,
      // The month only where it turns, so the run of numerals stays readable.
      header: day.monthLabel ? `${day.dayOfMonth} ${day.monthLabel}` : String(day.dayOfMonth),
      align: 'right',
    })),
    // Only when something is actually outside the window: an empty column on
    // every ordinary sheet is a column that stops being read.
    ...(showOutside ? [{ key: 'outside', header: 'นอกช่วง', align: 'right' } as LedgerColumn] : []),
    { key: 'paid', header: 'รวมรับ', align: 'right' },
    { key: 'outstanding', header: 'คงเหลือ', align: 'right' },
    { key: 'note', header: 'หมายเหตุ' },
  ];
}

export function toCollectionGroups(sheet: CollectionSheet, label: string): LedgerGroup[] {
  const showOutside = sheet.rows.some((row) => row.outsideWindow !== 0);

  return [
    {
      label,
      rows: sheet.rows.map((row): LedgerRow => {
        const cells: Record<string, LedgerCell> = {
          room: { kind: 'text', value: row.roomLabel },
          due: { kind: 'figure', value: billTotal(row.bill) },
          paid: { kind: 'figure', value: row.settlement.paid },
          // Zero is the ordinary end state and prints as a figure, not a
          // dash: a settled row should read as settled, not as unknown.
          outstanding: { kind: 'figure', value: row.settlement.outstanding },
          // ค้าง as the admin wrote it (KS-22) — never a computed balance.
          note: { kind: 'text', value: row.bill.arrearsNote ?? '', muted: true },
        };

        for (const day of sheet.days) {
          const amount = row.byDay.get(day.key);
          // **Blank, not an em dash.** `formatFigure(null)` is right in a
          // narrow ledger and wrong across sixteen columns: a wall of dashes
          // is what the eye has to look past to find the one cell with a
          // number in it, which is the only thing this sheet is for.
          cells[day.key] =
            amount === undefined
              ? { kind: 'text', value: '' }
              : { kind: 'figure', value: amount };
        }

        if (showOutside) {
          cells['outside'] =
            row.outsideWindow === 0
              ? { kind: 'text', value: '' }
              : { kind: 'figure', value: row.outsideWindow };
        }

        return { id: row.bill.id, cells };
      }),
    },
  ];
}
