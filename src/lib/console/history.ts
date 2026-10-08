import { formatReading, formatUnits } from '@/lib/format/thai';
import { billElectricityUnits, billTotal, type Bill } from '@/lib/models/bill';
import {
  cycleFor,
  cycleFromId,
  recentCycles,
  type BillingCycle,
} from '@/lib/models/billing-cycle';
import { settle, type Payment } from '@/lib/models/payment';
import { inWalkingOrder, type Room } from '@/lib/models/room';

/**
 * สมุดย้อนหลัง — every month's page of the notebook, not only this one.
 *
 * The step screens open on the cycle you are in, which is right for working
 * the month and wrong for answering "did 204 pay in June?" or "how much came
 * in last quarter?". This is the index those questions start from: one line
 * per cycle, worked out from the bills and payments on file.
 *
 * Pure, like `monthProgress`: handed what the repositories returned, so it is
 * tested without a sheet and uses the same `settle` the payment screens do.
 */

export interface CycleSummary {
  cycle: BillingCycle;
  /** The cycle today belongs to. */
  current: boolean;
  billCount: number;
  /** Bills paid in full, or over. */
  paidCount: number;
  billed: number;
  collected: number;
  /** What is still owed; an overpaid bill counts as zero, not a credit. */
  outstanding: number;
}

/**
 * One summary per cycle, newest first.
 *
 * The last `count` cycles always appear, billed or not — a month with no bills
 * is worth seeing as empty rather than wondering whether it was lost, the same
 * reasoning `recentCycles` gives for the pickers. Older cycles appear once
 * they have bills, so history reaches back as far as the sheet does.
 *
 * Bills filed under a cycle after today's are left out: nothing is issued
 * ahead of time, so such a row is a typo, and listing it would put a month
 * that has not happened at the top of the history.
 */
export function cycleHistory(
  bills: Bill[],
  payments: Payment[],
  now: Date,
  count = 12,
): CycleSummary[] {
  const currentId = cycleFor(now).id;
  const byCycle = new Map<string, Bill[]>();
  for (const bill of bills) {
    if (bill.archived) continue;
    const list = byCycle.get(bill.cycle) ?? [];
    list.push(bill);
    byCycle.set(bill.cycle, list);
  }

  const cycles = new Map(recentCycles(now, count).map((cycle) => [cycle.id, cycle]));
  for (const id of byCycle.keys()) {
    const cycle = cycleFromId(id);
    if (cycle && cycle.id <= currentId) cycles.set(cycle.id, cycle);
  }

  // Ids are `YYYY-MM`, so lexical order is date order — newest first.
  return [...cycles.values()]
    .sort((a, b) => b.id.localeCompare(a.id))
    .map((cycle) => {
      const settlements = (byCycle.get(cycle.id) ?? []).map((bill) => settle(bill, payments));
      return {
        cycle,
        current: cycle.id === currentId,
        billCount: settlements.length,
        paidCount: settlements.filter((s) => s.outstanding <= 0).length,
        billed: settlements.reduce((sum, s) => sum + s.due, 0),
        collected: settlements.reduce((sum, s) => sum + s.paid, 0),
        outstanding: settlements.reduce((sum, s) => sum + Math.max(s.outstanding, 0), 0),
      };
    });
}

/**
 * Which cycle a step screen shows, from its `?cycle=`.
 *
 * Shared by the screens that both look back and write — ออกบิล and รับเงิน —
 * so they agree on what a bad address means:
 *
 * - **absent** → the cycle you are in;
 * - **not a cycle** (`?cycle=abc`) → the cycle you are in, and say so;
 * - **after this one** → the cycle you are in, and say so. Nothing has been
 *   issued or collected there yet, and a screen that offered to issue into
 *   next month is the accident the bills page was built to prevent.
 *
 * `past` is the flag the pages act on: a past cycle is history, so ออกบิล
 * shows what was issued instead of offering to issue it again.
 */
export interface ViewedCycle {
  cycle: BillingCycle;
  past: boolean;
  /** Why the address was not honoured, ready to show; null when it was. */
  problem: string | null;
}

export function viewedCycle(requested: string | null, now: Date): ViewedCycle {
  const current = cycleFor(now);
  if (requested === null || requested.trim() === '') {
    return { cycle: current, past: false, problem: null };
  }

  const chosen = cycleFromId(requested);
  if (!chosen) {
    return { cycle: current, past: false, problem: `ไม่รู้จักรอบ "${requested}" — แสดงรอบปัจจุบันแทน` };
  }
  if (chosen.id > current.id) {
    return { cycle: current, past: false, problem: 'รอบนั้นยังไม่ถึง — แสดงรอบปัจจุบันแทน' };
  }
  return { cycle: chosen, past: chosen.id < current.id, problem: null };
}

/** One issued bill as the ออกบิล ledger shows it for a past cycle. */
export interface IssuedLine {
  bill: Bill;
  roomLabel: string;
  total: number;
  /** The working the bill kept — `11,900 → 11,948 = 48 หน่วย` — or `—`. */
  electricityBasis: string;
}

/**
 * A past cycle's bills, in the order the building is walked.
 *
 * Read off the bills themselves, never re-planned: `planBillRun` works from
 * today's rooms, leases and rates, and a past month re-planned from those
 * would show what it *would* charge now — a vacated room missing, a raised
 * rent restated. The issued figures are the record (see `Bill`), so they are
 * what history shows.
 */
export function issuedLines(bills: Bill[], rooms: Room[]): IssuedLine[] {
  const live = bills.filter((bill) => !bill.archived);
  const order = new Map(inWalkingOrder(rooms).map((room, index) => [room.id, index]));
  const labelOf = new Map(rooms.map((room) => [room.id, room.label]));

  return [...live]
    .sort(
      (a, b) =>
        (order.get(a.roomId) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.roomId) ?? Number.MAX_SAFE_INTEGER) || a.roomId.localeCompare(b.roomId),
    )
    .map((bill) => {
      const units = billElectricityUnits(bill);
      return {
        bill,
        // A bill for a room since removed from the register still happened.
        roomLabel: labelOf.get(bill.roomId) ?? bill.roomId,
        total: billTotal(bill),
        electricityBasis:
          units === null
            ? '—'
            : `${formatReading(bill.electricityPrevious!)} → ${formatReading(bill.electricityCurrent!)} = ${formatUnits(units)}`,
      };
    });
}
