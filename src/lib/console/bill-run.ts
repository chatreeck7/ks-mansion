import { formatBaht, formatReading, formatThaiDate, formatUnits } from '@/lib/format/thai';
import type { Bill, BillDraft } from '@/lib/models/bill';
import {
  chargeFor,
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
   * The same working as structured figures, for the issued bill to keep.
   *
   * `electricityBasis` is a sentence for the preview; these are what
   * ใบแจ้งค่าห้องพัก lays out in its own จำนวน and ราคา columns, and what the
   * bill row stores so a reprint years later still shows the dial figures
   * this tenant was charged from. Null where there is no reading, or where
   * the reading was already billed — a stale line charges nothing, so it has
   * no working to record.
   */
  electricityPrevious: number | null;
  electricityCurrent: number | null;
  /** Occupants where ค่าน้ำ is เหมา, units where the space is metered. */
  waterQuantity: number | null;
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
 * The electricity reading this cycle bills: simply the latest one on record.
 *
 * **No date window** — owner-decided, and it replaces one. The reading used
 * to have to fall between the previous issue date and this one, which sounds
 * right and is not how the building works: a round is walked whenever it is
 * walked, `26–30` for a month's meters is normal, and which calendar month a
 * figure lands in is an accident of when somebody had time to climb the
 * stairs. Worse, the window put the **25th** — a scheduled reading day — in
 * the cycle whose bill had already gone out a month earlier, so a round
 * walked on time produced "ยังไม่ได้จดมิเตอร์ไฟรอบนี้".
 *
 * So the rule is the one the admin already uses on paper: bill the newest
 * figure. It is also what `latestWaterReading` has always done, so the two
 * utilities now answer the same way.
 *
 * What the window *was* quietly protecting against is handled by
 * `alreadyBilled` below, and handled better — by asking whether the figure
 * has been charged before rather than which month it fell in.
 */
function electricityReading(readings: MeterReading[], roomId: string): MeterReading | null {
  let latest: MeterReading | null = null;
  for (const reading of readings) {
    if (reading.roomId !== roomId || reading.meterType !== 'electricity') continue;
    if (!latest || reading.readDate.getTime() >= latest.readDate.getTime()) latest = reading;
  }
  return latest;
}

/**
 * Whether this figure has already been charged on a bill that went out.
 *
 * Dropping the date window means a missed round no longer fails loudly — the
 * newest reading is simply last month's, and its units would be billed a
 * second time. This is the guard that replaces it, and it asks the question
 * that actually matters: **has a bill already gone out that this reading
 * predates?** If the room's most recent issued bill is dated on or after the
 * reading, that bill charged this figure (or a newer one) and there is
 * nothing new to charge.
 *
 * It does not constrain *when* a meter may be read, which is the point. A
 * round walked on the 25th, on the 30th, or in two halves across a weekend
 * all bill normally; only a round that was never walked at all is caught.
 */
function alreadyBilled(reading: MeterReading, roomBills: Bill[], cycleId: string): boolean {
  const readAt = reading.readDate.getTime();
  return roomBills.some(
    // This cycle's own bill is excluded: `alreadyIssued` already keeps that
    // room out of the run, and counting it here would add a second, wronger
    // reason — a round walked on the 26th and billed the same evening is not
    // a stale reading.
    (bill) => bill.cycle !== cycleId && bill.issueDate.getTime() >= readAt,
  );
}

function waterLineFor(
  row: WaterRow | undefined,
): { amount: number; basis: string; quantity: number | null } | null {
  if (!row || row.charge === null) return null;
  return {
    amount: row.charge,
    basis:
      row.basis === 'metered'
        ? `มิเตอร์น้ำ ${row.units === null ? '' : formatUnits(row.units)}`.trim()
        : `${formatBaht(row.occupantCount ?? 0)} คน × 100`,
    // Whichever of the two the charge was reckoned per — the bill prints one
    // จำนวน column and does not care which kind of "how many" it holds.
    quantity: row.basis === 'metered' ? row.units : row.occupantCount,
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
  // Every cycle's bills, not just this one's: `alreadyBilled` asks what has
  // gone out before, which is exactly the history this cycle's map drops.
  const billsFor = new Map<string, Bill[]>();
  for (const bill of existing) {
    const forRoom = billsFor.get(bill.roomId);
    if (forRoom) forRoom.push(bill);
    else billsFor.set(bill.roomId, [bill]);
  }

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

    const reading = electricityReading(readings, room.id);
    const stale =
      reading !== null && alreadyBilled(reading, billsFor.get(room.id) ?? [], cycle.id);
    const units = reading ? reading.currentReading - reading.previousReading : 0;
    const electricityAmount = reading && !stale ? units * reading.ratePerUnit : 0;
    if (!reading) problems.push('ยังไม่ได้จดมิเตอร์ไฟ');
    else if (stale) {
      problems.push(
        `เลขมิเตอร์ล่าสุด (${formatThaiDate(reading.readDate)}) ออกบิลไปแล้ว — ยังไม่ได้จดรอบใหม่`,
      );
    }

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
      // The date is part of the basis now that no window constrains which
      // reading is used: it is the only thing on the row that says whether
      // this figure is from the round just walked or from one before it.
      electricityBasis: reading
        ? `${formatThaiDate(reading.readDate)} · ` +
          `${formatReading(reading.previousReading)} → ${formatReading(reading.currentReading)} = ` +
          `${formatUnits(units)} × ${formatReading(reading.ratePerUnit)} บาท`
        : '—',
      waterBasis: waterLine?.basis ?? '—',
      // A stale reading charges nothing, so it records nothing: printing a
      // derivation beside a zero would say the meter was read for this bill.
      electricityPrevious: reading && !stale ? reading.previousReading : null,
      electricityCurrent: reading && !stale ? reading.currentReading : null,
      waterQuantity: waterLine?.quantity ?? null,
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
    electricityPrevious: line.electricityPrevious,
    electricityCurrent: line.electricityCurrent,
    waterQuantity: line.waterQuantity,
    // Never carried over from a previous cycle: ค้าง is something an admin
    // asserts on a bill after issue (KS-22), not something a run infers.
    arrearsNote: null,
  }));
}
