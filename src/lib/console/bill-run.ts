import { formatBaht, formatUnits } from '@/lib/format/thai';
import type { Bill, BillDraft } from '@/lib/models/bill';
import {
  chargeFor,
  previousCycle,
  type BillingCycle,
  type CycleCharge,
} from '@/lib/models/billing-cycle';
import { activeLeaseFor, type Lease } from '@/lib/models/lease';
import { type MeterReading } from '@/lib/models/meter-reading';
import { chargesRent, inWalkingOrder, type Room } from '@/lib/models/room';
import { waterRows, type WaterRow } from './water-ledger';

/**
 * Working out one cycle's bills, before any of them is written (KS-21).
 *
 * Pure: no repository, no rendering. It produces a **plan** — every room's
 * three charges with the reason each figure is what it is, plus anything
 * standing in the way — which the preview screen renders and the issue action
 * turns into drafts. Nothing here writes, so the preview and the write cannot
 * disagree about what is about to happen.
 *
 * Three rules from the source documents shape this, none of them stated in
 * AC-1.5:
 *
 * 1. **Rent is next month's, utilities are this month's** (KS-20). The cycle
 *    carries both labels; this module never decides a month for itself.
 * 2. **Water is `จำนวนผู้พัก × 100`, except ร้านซักผ้า which is metered.**
 *    Reused wholesale from KS-19 rather than restated, so the water screen and
 *    the bill can never disagree about a figure the admin has just checked.
 * 3. **The electricity rate is per room and per cycle** — ฿6 and ฿7 have been
 *    observed in the same month, because it tracks government tariffs. It is
 *    read off the meter reading that was taken, never from a constant here.
 */

export interface BillLine {
  roomId: string;
  roomLabel: string;
  /** Null where a room is billed with no tenancy behind it. */
  leaseId: string | null;
  charge: CycleCharge;
  rentAmount: number;
  electricityAmount: number;
  waterAmount: number;
  total: number;
  /**
   * How each figure was arrived at, for the preview.
   *
   * The paper bill shows previous reading, current reading, units *and* rate
   * on the ค่าไฟ line rather than just an amount — so the preview that
   * replaces it has to show the same working, or it is harder to check than
   * the form it is replacing.
   */
  electricityBasis: string;
  waterBasis: string;
  /**
   * Why this room cannot be billed yet. A line with problems is shown but
   * never issued — a bill built on a missing reading is a wrong number sent
   * to a tenant, which is worse than a bill that is late.
   */
  problems: string[];
  /** A bill already issued for this room and cycle, if there is one. */
  alreadyIssued: Bill | null;
}

export interface BillRun {
  cycle: BillingCycle;
  /** Every room worth showing, in walking order. */
  lines: BillLine[];
  /** The subset that will actually be written on confirm. */
  issuable: BillLine[];
  /** What the issuable lines come to. */
  total: number;
}

export interface BillRunInput {
  cycle: BillingCycle;
  rooms: Room[];
  leases: Lease[];
  readings: MeterReading[];
  /** Bills already on the sheet — any cycle; this filters to the one it needs. */
  existing: Bill[];
}

/**
 * The electricity reading this cycle bills.
 *
 * Taken from the window between the previous issue and this one rather than
 * strictly the 25th–26th: a round is sometimes walked a day early, and
 * refusing to bill over that would be the console being pedantic about a
 * detail the building does not care about. The latest reading in the window
 * wins, which is how a เก็บตก correction supersedes the figure it corrects.
 */
function electricityReading(
  readings: MeterReading[],
  roomId: string,
  cycle: BillingCycle,
): MeterReading | null {
  const opensAfter = previousCycle(cycle).issueDate.getTime();
  const closesOn = cycle.issueDate.getTime();

  let latest: MeterReading | null = null;
  for (const reading of readings) {
    if (reading.roomId !== roomId || reading.meterType !== 'electricity') continue;
    const at = reading.readDate.getTime();
    if (at <= opensAfter || at > closesOn) continue;
    if (!latest || at >= latest.readDate.getTime()) latest = reading;
  }
  return latest;
}

function waterLineFor(row: WaterRow | undefined): { amount: number; basis: string } | null {
  if (!row || row.charge === null) return null;
  return {
    amount: row.charge,
    basis:
      row.basis === 'metered'
        ? `มิเตอร์น้ำ ${row.units === null ? '' : formatUnits(row.units)}`.trim()
        : `${formatBaht(row.occupantCount ?? 0)} คน × 100`,
  };
}

/**
 * Plans a cycle.
 *
 * **A vacant room produces no line at all** — owner-confirmed. A zero-amount
 * bill for an empty room is a row somebody has to read past every cycle, and
 * a collection sheet that lists it implies money is expected from it.
 */
export function planBillRun({
  cycle,
  rooms,
  leases,
  readings,
  existing,
}: BillRunInput): BillRun {
  const water = new Map(
    waterRows(rooms, leases, readings, cycle.issueDate).map((row) => [row.roomId, row]),
  );
  const issuedThisCycle = new Map(
    existing.filter((bill) => bill.cycle === cycle.id).map((bill) => [bill.roomId, bill]),
  );

  const lines: BillLine[] = [];

  for (const room of inWalkingOrder(rooms.filter((r) => !r.archived))) {
    const charge = chargeFor(room);
    if (charge === 'nothing') continue;

    const problems: string[] = [];
    const lease = activeLeaseFor(
      leases.filter((l) => l.roomId === room.id),
      cycle.issueDate,
    );

    // `chargesRent` is the แจ้งออก rule (KS-62), consumed rather than
    // re-derived: a room under notice pays for the power it used this month
    // and no rent for a month it will not be here for.
    let rentAmount = 0;
    if (chargesRent(room)) {
      if (lease) {
        // The lease's rate, not the room's. The room's is what it is advertised
        // at now; the lease's is what this tenant agreed to.
        rentAmount = lease.rentRate;
      } else {
        problems.push('ห้องมีผู้เช่าแต่ไม่มีสัญญาเช่า');
      }
    }

    const reading = electricityReading(readings, room.id, cycle);
    const units = reading ? reading.currentReading - reading.previousReading : 0;
    const electricityAmount = reading ? units * reading.ratePerUnit : 0;
    if (!reading) problems.push('ยังไม่ได้จดมิเตอร์ไฟรอบนี้');

    const waterLine = waterLineFor(water.get(room.id));
    if (!waterLine) problems.push('คิดค่าน้ำไม่ได้ — ไม่มีสัญญาเช่าหรือยังไม่ได้จดมิเตอร์น้ำ');

    const waterAmount = waterLine?.amount ?? 0;

    lines.push({
      roomId: room.id,
      roomLabel: room.label,
      leaseId: lease?.id ?? null,
      charge,
      rentAmount,
      electricityAmount,
      waterAmount,
      total: rentAmount + electricityAmount + waterAmount,
      electricityBasis: reading
        ? `${formatBaht(reading.previousReading)} → ${formatBaht(reading.currentReading)} = ` +
          `${formatUnits(units)} × ${formatBaht(reading.ratePerUnit)} บาท`
        : '—',
      waterBasis: waterLine?.basis ?? '—',
      problems,
      alreadyIssued: issuedThisCycle.get(room.id) ?? null,
    });
  }

  const issuable = lines.filter((line) => line.problems.length === 0 && !line.alreadyIssued);

  return {
    cycle,
    lines,
    issuable,
    total: issuable.reduce((sum, line) => sum + line.total, 0),
  };
}

/** The drafts a confirmed run writes. Only the issuable lines produce one. */
export function draftsFrom(run: BillRun): BillDraft[] {
  return run.issuable.map((line) => ({
    roomId: line.roomId,
    leaseId: line.leaseId,
    cycle: run.cycle.id,
    issueDate: run.cycle.issueDate,
    dueDate: run.cycle.dueDate,
    rentAmount: line.rentAmount,
    electricityAmount: line.electricityAmount,
    waterAmount: line.waterAmount,
    // Never carried over from a previous cycle: ค้าง is something an admin
    // asserts on a bill after issue (KS-22), not something a run infers.
    arrearsNote: null,
  }));
}
