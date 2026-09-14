/** Thai month abbreviations, indexed to match Date.getMonth(). */
export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;

/** The Buddhist calendar runs 543 years ahead of the Gregorian one. */
export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + 543;
}

/** Inverse of `toBuddhistYear`; parsing needs the direction the display does not. */
export function fromBuddhistYear(buddhistYear: number): number {
  return buddhistYear - 543;
}

/** '1 มี.ค. 2568'. Reads the date in local time, matching how it was entered. */
export function formatThaiDate(date: Date): string {
  const day = date.getDate();
  const month = THAI_MONTHS_SHORT[date.getMonth()];
  const year = toBuddhistYear(date.getFullYear());
  return `${day} ${month} ${year}`;
}

/**
 * 'ก.ค. 2568' — a month without a day.
 *
 * The billing cycle names two different months on one bill (rent for the
 * month ahead, utilities for the one just ended), and a full date would
 * imply a precision neither of them has.
 */
export function formatThaiMonth(date: Date): string {
  return `${THAI_MONTHS_SHORT[date.getMonth()]} ${toBuddhistYear(date.getFullYear())}`;
}

/**
 * Money. Thousands-grouped, no decimals — satang are not tracked.
 *
 * **Only for baht.** `maximumFractionDigits: 0` does not truncate, it
 * *rounds*: `4215.6` prints as `4,216`. That is correct for a bill total and
 * wrong for anything measured, so a meter dial, a unit count or any other
 * quantity that can hold a fraction must use `formatReading` instead — see
 * the note on that function for what showing a rounded dial figure cost.
 */
export function formatBaht(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * A measured figure, printed as it is stored.
 *
 * Meter dials in this building carry fractions — the sheet holds them, and
 * the console must not invent a different number than the one an admin can
 * see in the cell next to it. Before this existed every meter figure went
 * through `formatBaht`, which rounded `1677.5` to `1,678` on screen while the
 * repository kept and compared `1677.5`.
 *
 * That was not only cosmetic. The round's rejection message quoted the
 * *rounded* figure, so typing `1677` was refused with "น้อยกว่าครั้งก่อน
 * (1,678)" — a reason that cannot be acted on, because 1,678 is not what the
 * reading is being compared against.
 *
 * Three decimals is the cap because a dial is not arbitrary precision and an
 * unbounded float would print `1677.4000000000001` after one subtraction.
 */
export function formatReading(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** A money figure, or an em dash when there is no value. */
export function formatFigure(value: number | null): string {
  return value === null ? '—' : formatBaht(value);
}

/** A measured figure, or an em dash when there is no value. */
export function formatReadingFigure(value: number | null): string {
  return value === null ? '—' : formatReading(value);
}

/** Units consumed — a dial difference, so measured rather than money. */
export function formatUnits(units: number): string {
  return `${formatReading(units)} หน่วย`;
}
