import { THAI_MONTHS_SHORT, formatThaiMonthName, toBuddhistYear } from '@/lib/format/thai';
import type { BillingCycle } from '@/lib/models/billing-cycle';

/**
 * Words the logbook uses for the month, so every screen names it the same.
 *
 * The notebook is named after the month whose meters are read and whose
 * utilities are billed — the cycle issued on the 26th of September is
 * "สมุดเดือนกันยายน", even though it is collected into October and charges
 * October's rent. That is how the family already says it.
 */

/** 'กันยายน 2569' — the month a notebook page is named after. */
export function notebookMonth(cycle: BillingCycle): string {
  const month = cycle.utilityMonth;
  return `${formatThaiMonthName(month)} ${toBuddhistYear(month.getFullYear())}`;
}

/** 'สมุดเดือนกันยายน 2569' */
export function notebookTitle(cycle: BillingCycle): string {
  return `สมุดเดือน${notebookMonth(cycle)}`;
}

/** 'ก.ย.' — the notebook's short name, for the spine. */
export function notebookShortName(cycle: BillingCycle): string {
  return THAI_MONTHS_SHORT[cycle.utilityMonth.getMonth()]!;
}

function dayMonth(date: Date): string {
  return `${date.getDate()} ${THAI_MONTHS_SHORT[date.getMonth()]}`;
}

/**
 * 'รอบเคลียร์บิล 26 ก.ย. – 10 ต.ค. 2569' — the year once, at the end.
 *
 * Named for what the window is (owner's wording, 7 พ.ย. 2569): the days the
 * cycle's bills are out and being cleared, from issue to due date. A bare
 * "รอบ 26 ก.ย. – 10 ต.ค." read like the notebook's own dates.
 */
export function shortCycleLabel(cycle: BillingCycle): string {
  return `รอบเคลียร์บิล ${dayMonth(cycle.issueDate)} – ${dayMonth(cycle.dueDate)} ${toBuddhistYear(cycle.dueDate.getFullYear())}`;
}

/** 'จดมิเตอร์ 25 พ.ย. · ออกบิล 26 พ.ย.' — what this page of the notebook asks for. */
export function notebookScheduleLabel(cycle: BillingCycle): string {
  return `จดมิเตอร์ ${dayMonth(cycle.readFrom)} · ออกบิล ${dayMonth(cycle.issueDate)}`;
}

/** Whole days from `today` to the due date; negative once it has passed. */
export function daysUntilDue(cycle: BillingCycle, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const due = new Date(
    cycle.dueDate.getFullYear(),
    cycle.dueDate.getMonth(),
    cycle.dueDate.getDate(),
  ).getTime();
  return Math.round((due - start) / 86_400_000);
}

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'] as const;

/** 'วันเสาร์ 3 ต.ค.' */
export function todayLabel(today: Date): string {
  return `วัน${WEEKDAYS[today.getDay()]} ${dayMonth(today)}`;
}

/** 'ครบกำหนดชำระ 10 ต.ค. (อีก 7 วัน)' */
export function dueLabel(cycle: BillingCycle, today: Date): string {
  const days = daysUntilDue(cycle, today);
  const when =
    days > 0 ? `อีก ${days} วัน` : days === 0 ? 'วันนี้' : `เลยมา ${-days} วัน`;
  return `ครบกำหนดชำระ ${dayMonth(cycle.dueDate)} (${when})`;
}
