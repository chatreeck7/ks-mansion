/**
 * The arithmetic behind the console's date picker, kept free of the DOM so
 * it is tested like everything else. Dates travel as `YYYY-MM-DD` — what a
 * form posts and what `dateFromInput` reads — and are shown in พ.ศ.
 */

export const THAI_MONTHS_LONG = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const;
export const THAI_MONTHS_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;
/** Sunday first, as Thai wall calendars are. */
export const THAI_WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;

export interface Day {
  year: number;
  /** 0-based, like `Date`. */
  month: number;
  day: number;
}

export function parseIso(value: string | null | undefined): Day | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, month, day);
  return date.getMonth() === month && date.getDate() === day ? { year, month, day } : null;
}

export function toIso(d: Day): string {
  return `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

export function fromDate(date: Date): Day {
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

/** `8 พ.ย. 2569`. */
export function thaiLabel(d: Day): string {
  return `${d.day} ${THAI_MONTHS_ABBR[d.month]} ${d.year + 543}`;
}

/** `วันอาทิตย์ที่ 8 พฤศจิกายน 2569` — what a screen reader hears for a day. */
export function thaiLongLabel(d: Day): string {
  const weekday = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][new Date(d.year, d.month, d.day).getDay()];
  return `วัน${weekday}ที่ ${d.day} ${THAI_MONTHS_LONG[d.month]} ${d.year + 543}`;
}

/** Days moved by `days`, across month and year ends. */
export function addDays(d: Day, days: number): Day {
  return fromDate(new Date(d.year, d.month, d.day + days));
}

/** Same day in another month, pulled back to that month's last day (31 ม.ค. + 1 → 28/29 ก.พ.). */
export function addMonths(d: Day, months: number): Day {
  const first = new Date(d.year, d.month + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return { year: first.getFullYear(), month: first.getMonth(), day: Math.min(d.day, last) };
}

export function compare(a: Day, b: Day): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function sameDay(a: Day | null, b: Day | null): boolean {
  return a !== null && b !== null && compare(a, b) === 0;
}

export function withinRange(d: Day, min: Day | null, max: Day | null): boolean {
  return (min === null || compare(d, min) >= 0) && (max === null || compare(d, max) <= 0);
}

/** Six weeks starting on the Sunday on or before the 1st — a steady 42-cell grid. */
export function monthGrid(year: number, month: number): Day[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) =>
    fromDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)),
  );
}
