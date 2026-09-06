import { formatThaiDate, formatThaiMonth } from '@/lib/format/thai';
import type { Room } from './room';

/**
 * The collection cycle (KS-20): meters read on the 25th–26th, bill issued on
 * the 26th, payment due by the 10th.
 *
 * **One bill points in two directions in time**, which is the thing AC-1.3
 * does not say and the thing most likely to be got wrong. The collection form
 * states it on its own header:
 *
 * > `รายการโอนเงินจ่ายค่าห้องพัก ณ สิ้นเดือน ก.ค. [ เก็บค่าเช่าของ ส.ค.,
 * >   ค่าน้ำค่าไฟของ ก.ค. ]`
 *
 * Rent is paid **in advance for the month ahead**; electricity and water are
 * for the month just **consumed**, which is what the meters were read for.
 * Owner confirmed. A cycle that treats both lines as belonging to the same
 * month is wrong by a month on one of them, and looks right at a glance —
 * which is why `rentMonth` and `utilityMonth` are separate fields here rather
 * than one `month` a caller has to interpret.
 *
 * It is also why a departing tenant is never charged a part month: they have
 * already paid for the month ahead, so there is nothing to prorate (KS-13,
 * closed as not applicable).
 */

/** Meters are read the day before issue, so a round can span two evenings. */
const READ_START_DAY = 25;
/** Meters read, bill issued. Every month has a 26th, so this never shifts. */
const ISSUE_DAY = 26;
/** Payment due, in the month after issue. */
const DUE_DAY = 10;

export interface BillingCycle {
  /** `YYYY-MM` of the issue month. Sortable, and deliberately not a label. */
  id: string;
  /** First day meters may be read for this cycle. */
  readFrom: Date;
  /** The 26th — last read day, and the day the bill is issued. */
  issueDate: Date;
  /** The 10th of the following month. */
  dueDate: Date;
  /** First of the month whose electricity and water this bill charges. */
  utilityMonth: Date;
  /** First of the month whose rent this bill charges — the month **ahead**. */
  rentMonth: Date;
}

/** The cycle issued on the 26th of a given month. */
export function cycleIssuedIn(year: number, monthIndex: number): BillingCycle {
  const issueDate = new Date(year, monthIndex, ISSUE_DAY);

  return {
    // Taken off `issueDate` rather than the arguments, so an out-of-range
    // month index that `Date` rolls over still produces the id it landed on.
    id: `${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, '0')}`,
    readFrom: new Date(year, monthIndex, READ_START_DAY),
    issueDate,
    dueDate: new Date(year, monthIndex + 1, DUE_DAY),
    // The month that is ending: its consumption is what was just read.
    utilityMonth: new Date(year, monthIndex, 1),
    // The month ahead: rent is always paid before it starts.
    rentMonth: new Date(year, monthIndex + 1, 1),
  };
}

/**
 * The cycle a given day belongs to.
 *
 * The boundary is the 26th, not the 1st: on the 26th the meters are read and
 * a new bill goes out, so the 25th is the tail of the previous cycle and the
 * 26th is the head of the next. Anchoring on the calendar month instead would
 * put the five days before month end in the wrong cycle every time.
 */
export function cycleFor(date: Date): BillingCycle {
  const monthIndex = date.getDate() >= ISSUE_DAY ? date.getMonth() : date.getMonth() - 1;
  return cycleIssuedIn(date.getFullYear(), monthIndex);
}

export function nextCycle(cycle: BillingCycle): BillingCycle {
  return cycleIssuedIn(cycle.issueDate.getFullYear(), cycle.issueDate.getMonth() + 1);
}

export function previousCycle(cycle: BillingCycle): BillingCycle {
  return cycleIssuedIn(cycle.issueDate.getFullYear(), cycle.issueDate.getMonth() - 1);
}

/** Midnight local, so comparisons are by day and ignore the time. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Whether a day falls in this cycle's collection window — the 26th through
 * the 10th, both inclusive.
 *
 * That window is not an interpretation: the collection form has one column
 * per day of it, `26 27 28 29 30 31 1 2 … 10`. Both ends are inclusive
 * because a payment handed over on the due date is on time.
 */
export function isCollecting(cycle: BillingCycle, date: Date): boolean {
  const day = startOfDay(date);
  return day >= startOfDay(cycle.issueDate) && day <= startOfDay(cycle.dueDate);
}

/** Whether a reading taken on this day belongs to this cycle's round. */
export function isReadingDay(cycle: BillingCycle, date: Date): boolean {
  const day = startOfDay(date);
  return day >= startOfDay(cycle.readFrom) && day <= startOfDay(cycle.issueDate);
}

/**
 * What a room is charged this cycle.
 *
 * Three states, not two — the `จะได้รับ ณ สิ้นเดือน` column of the source
 * report has `YES` / `NO` / `Utility`, and the third is the reason
 * `noticeGiven` exists as a distinct room status: a room under แจ้งออก is
 * still using electricity and water this month but is not paying rent for
 * next month, because there will not be a next month. A boolean
 * occupied/vacant cannot express that, and collapsing it either bills a
 * departing tenant rent they do not owe or drops their utilities entirely.
 */
export type CycleCharge = 'rentAndUtilities' | 'utilitiesOnly' | 'nothing';

export function chargeFor(room: Room): CycleCharge {
  if (room.status === 'occupied') return 'rentAndUtilities';
  if (room.status === 'noticeGiven') return 'utilitiesOnly';
  return 'nothing';
}

const CHARGE_LABELS: Record<CycleCharge, string> = {
  rentAndUtilities: 'ค่าเช่า + ค่าน้ำค่าไฟ',
  utilitiesOnly: 'เฉพาะค่าน้ำค่าไฟ',
  nothing: 'ไม่เก็บ',
};

export function chargeLabel(charge: CycleCharge): string {
  return CHARGE_LABELS[charge];
}

/** 'รอบ 26 ก.ค. 2568 – 10 ส.ค. 2568' — the collection window, as it is walked. */
export function cycleLabel(cycle: BillingCycle): string {
  return `รอบ ${formatThaiDate(cycle.issueDate)} – ${formatThaiDate(cycle.dueDate)}`;
}

/** What each line of the bill is actually for, spelled out. */
export function rentLabel(cycle: BillingCycle): string {
  return `ค่าเช่าเดือน ${formatThaiMonth(cycle.rentMonth)}`;
}

export function utilityLabel(cycle: BillingCycle): string {
  return `ค่าน้ำค่าไฟเดือน ${formatThaiMonth(cycle.utilityMonth)}`;
}
