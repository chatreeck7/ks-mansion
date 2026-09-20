import { billTotal, type Bill } from '@/lib/models/bill';
import type { BillingCycle } from '@/lib/models/billing-cycle';
import { settle, type Payment, type Settlement } from '@/lib/models/payment';
import { inWalkingOrder, type Room } from '@/lib/models/room';
import { formatThaiMonth, THAI_MONTHS_SHORT } from '@/lib/format/thai';

/**
 * แบบฟอร์มเก็บเงินค่าห้อง — the collection sheet (KS-25).
 *
 * **Four column groups, exactly as the paper has them**: `ห้อง`, `ค่าห้องฯ`,
 * one narrow column per day of the 26→10 window, and `หมายเหตุ`. Nothing
 * else. The first version of this added รวมรับ, คงเหลือ and นอกช่วง, which
 * are all *true* and none of which are on the form — a sheet that carries
 * three more columns than the one it replaces is not the same sheet, and the
 * admin filling it in is reading across a row by position.
 *
 * **Every room gets a row, billed or not.** The paper lists 206, 305, 310 and
 * ห้องใต้ถุน with an empty `ค่าห้องฯ`, and that is the point: the collector
 * ticks down the whole building, and a room that vanished from the list is a
 * room nobody checks. (`planBillRun` is right to leave a vacant room off the
 * *bill run* — this is a different document with a different job.)
 *
 * **Read-only.** `/console/payments` records what arrived; this is the sheet
 * an admin looks *at*, and the question it answers — who has not paid yet —
 * is answered by an empty run of cells. An input in each of sixteen day cells
 * would be a grid one mis-click away from recording a payment on the wrong
 * day.
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
 * time. The run crosses a month boundary by construction, and its length
 * varies with the issue month — out of February it is thirteen days, not
 * sixteen, which is why this is generated rather than a fixed list.
 */
export function collectionDays(cycle: BillingCycle): CollectionDay[] {
  const days: CollectionDay[] = [];
  const last = startOfDay(cycle.dueDate);

  for (
    let at = startOfDay(cycle.issueDate);
    at.getTime() <= last.getTime();
    at = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1)
  ) {
    days.push({
      key: dayKey(at),
      dayOfMonth: at.getDate(),
      // Only where the month turns: a header reading `31 1 2` is a date range
      // nobody can read, and one reading `31 | 1 เม.ย. | 2` is.
      monthLabel:
        days.length === 0 || at.getDate() === 1 ? THAI_MONTHS_SHORT[at.getMonth()]! : null,
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
  /** Null for a room with no bill this cycle — a blank ค่าห้องฯ on the paper. */
  bill: Bill | null;
  /** The bill's total, or null where there is no bill. */
  due: number | null;
  /** Null where there is no bill to settle. */
  settlement: Settlement | null;
  /** Day key → what arrived that day. Absent where nothing did. */
  byDay: Map<string, number>;
  /**
   * Money against this bill that landed outside the window.
   *
   * **The paper has no column for it and that is the problem, not the
   * answer.** A payment on the 12th is late, not imaginary, and a sheet that
   * silently dropped it would show an outstanding balance the tenant has
   * already settled. It is kept here and printed as a footnote under the
   * table rather than as a seventeenth column, so the grid stays the grid.
   */
  outsideWindow: number;
  /** When that money actually arrived, for the footnote to name. */
  outsideWindowDates: Date[];
  /** ค้าง as an admin wrote it (KS-22) — the paper's own หมายเหตุ column. */
  note: string | null;
}

export interface CollectionSheet {
  cycle: BillingCycle;
  days: CollectionDay[];
  rows: CollectionRow[];
  /** The paper's รวม row: every ค่าห้องฯ added up. */
  billed: number;
  collected: number;
  outstanding: number;
  /** Rows with money outside the window, for the footnote. Usually empty. */
  late: CollectionRow[];
}

/**
 * The form's own header line.
 *
 * Transcribed from the paper, which states the thing most likely to be got
 * wrong right across its top: rent is for the month **ahead** and utilities
 * for the month just **consumed**. `billing-cycle.ts` quotes the same line
 * for the same reason.
 */
export function collectionHeading(cycle: BillingCycle): string {
  return (
    `รายการโอนเงินจ่ายค่าห้องพัก ณ สิ้นเดือน ${formatThaiMonth(cycle.utilityMonth)} ` +
    `[ เก็บค่าเช่าของ ${formatThaiMonth(cycle.rentMonth)}, ` +
    `ค่าน้ำค่าไฟของ ${formatThaiMonth(cycle.utilityMonth)} ]`
  );
}

export function collectionSheetFor(
  cycle: BillingCycle,
  bills: Bill[],
  payments: Payment[],
  rooms: Room[],
): CollectionSheet {
  const days = collectionDays(cycle);
  const inWindow = new Set(days.map((day) => day.key));
  const billFor = new Map(bills.map((bill) => [bill.roomId, bill]));

  // Walking order, so the sheet reads in the order the building is walked and
  // the paper is filled in. An archived room is gone from the registry and so
  // from the sheet; a *vacant* one is not — see the note at the top.
  const rows = inWalkingOrder(rooms.filter((room) => !room.archived)).map(
    (room): CollectionRow => {
      const bill = billFor.get(room.id) ?? null;
      const byDay = new Map<string, number>();
      let outsideWindow = 0;
      const outsideWindowDates: Date[] = [];

      const settlement = bill ? settle(bill, payments) : null;

      // `settle` has already dropped voided rows and payments against other
      // bills, so this only has to place what it kept.
      for (const payment of settlement?.payments ?? []) {
        const key = dayKey(payment.paidOn);
        if (inWindow.has(key)) {
          byDay.set(key, (byDay.get(key) ?? 0) + payment.amount);
        } else {
          outsideWindow += payment.amount;
          outsideWindowDates.push(payment.paidOn);
        }
      }

      return {
        roomId: room.id,
        roomLabel: room.label,
        bill,
        due: bill ? billTotal(bill) : null,
        settlement,
        byDay,
        outsideWindow,
        outsideWindowDates,
        note: bill?.arrearsNote?.trim() ? bill.arrearsNote : null,
      };
    },
  );

  return {
    cycle,
    days,
    rows,
    billed: rows.reduce((sum, row) => sum + (row.due ?? 0), 0),
    collected: rows.reduce((sum, row) => sum + (row.settlement?.paid ?? 0), 0),
    outstanding: rows.reduce((sum, row) => sum + (row.settlement?.outstanding ?? 0), 0),
    late: rows.filter((row) => row.outsideWindow !== 0),
  };
}
