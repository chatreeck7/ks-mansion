import { formatBaht, formatThaiDate, formatThaiMonth } from '@/lib/format/thai';
import {
  advanceCoveredMonth,
  billingStart,
  billingStartsIn,
  cycleIssuedIn,
  rentPaidInAdvance,
  type BillingCycle,
} from './billing-cycle';
import type { Lease } from './lease';

/**
 * The rent on a tenancy's bills around move-in, from the terms agreed at
 * signing (owner, 7 พ.ย. 2569 — every move-in is negotiated, so the console
 * follows what was agreed and adds no rule of its own):
 *
 * - **Before billing starts** — nothing is billed. `billingStartDate` may be
 *   later than move-in (in on 30 ต.ค., billed from 1 พ.ย.).
 * - **The first bill** — the month ค่าเช่าล่วงหน้า paid for is not charged
 *   again; the part month before that, from the billing start to its month's
 *   end, is charged at `proratePerDay` if one was agreed.
 * - **After that** — the lease's rate.
 *
 * Utilities are not here: they come from the meter, and the first bill's
 * units count from the tenancy's start meter (see `meterStanding`).
 *
 * One function, used by the bill run and by the first-bill preview on the
 * lease form, so what the form promises is what the bill charges.
 */

export interface RentForCycle {
  /** False before billing starts: the room owes nothing this cycle. */
  billing: boolean;
  rentAmount: number;
  /** Why the rent is what it is, when that is not simply the rate. Null otherwise. */
  basis: string | null;
  partialDays: number;
  partialAmount: number;
}

type MoveInTerms = Pick<
  Lease,
  'startDate' | 'billingStartDate' | 'advanceRent' | 'rentRate' | 'proratePerDay'
>;

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function rentForCycle(lease: MoveInTerms, cycle: BillingCycle): RentForCycle {
  const start = billingStart(lease);
  if (start.getTime() > cycle.issueDate.getTime()) {
    return {
      billing: false,
      rentAmount: 0,
      basis: `เริ่มคิดเงิน ${formatThaiDate(start)}`,
      partialDays: 0,
      partialAmount: 0,
    };
  }
  if (!billingStartsIn(lease, cycle)) {
    return { billing: true, rentAmount: lease.rentRate, basis: null, partialDays: 0, partialAmount: 0 };
  }

  const parts: string[] = [];
  const covered = rentPaidInAdvance(start, lease.advanceRent, cycle);
  let rentAmount = covered ? 0 : lease.rentRate;
  if (covered) parts.push(`ค่าเช่า ${formatThaiMonth(cycle.rentMonth)} จ่ายล่วงหน้าแล้ว`);
  else if (lease.advanceRent > 0) {
    parts.push(`ค่าเช่า ${formatThaiMonth(advanceCoveredMonth(start))} จ่ายล่วงหน้าแล้ว`);
  }

  let partialDays = 0;
  let partialAmount = 0;
  if (start.getDate() !== 1) {
    partialDays = daysInMonth(start) - start.getDate() + 1;
    const rate = lease.proratePerDay ?? 0;
    if (rate > 0) {
      partialAmount = partialDays * rate;
      rentAmount += partialAmount;
      parts.push(`เศษเดือน ${partialDays} วัน × ${formatBaht(rate)} = ${formatBaht(partialAmount)}`);
    } else {
      parts.push(`เศษเดือน ${partialDays} วัน ไม่คิด`);
    }
  }
  return { billing: true, rentAmount, basis: parts.join(' · ') || null, partialDays, partialAmount };
}

/** The cycle that carries a tenancy's first bill. */
export function firstBillCycle(lease: Pick<Lease, 'startDate' | 'billingStartDate'>): BillingCycle {
  const start = billingStart(lease);
  const sameMonth = cycleIssuedIn(start.getFullYear(), start.getMonth());
  return start.getTime() <= sameMonth.issueDate.getTime()
    ? sameMonth
    : cycleIssuedIn(start.getFullYear(), start.getMonth() + 1);
}

/** One sentence for the lease form: what the first bill will charge, before utilities. */
export function firstBillSummary(lease: MoveInTerms & Pick<Lease, 'startMeter'>): string {
  const cycle = firstBillCycle(lease);
  const rent = rentForCycle(lease, cycle);
  const parts = [
    `บิลแรกออก ${formatThaiDate(cycle.issueDate)}`,
    rent.rentAmount > 0 && rent.rentAmount !== rent.partialAmount
      ? `ค่าเช่า ${formatThaiMonth(cycle.rentMonth)} ${formatBaht(rent.rentAmount - rent.partialAmount)}`
      : null,
    rent.basis,
    lease.startMeter !== null ? `ค่าไฟคิดจากมิเตอร์ ${lease.startMeter.toLocaleString('en-US')}` : 'ค่าไฟคิดจากเลขปิดรอบก่อน',
  ].filter(Boolean);
  return parts.join(' · ');
}
