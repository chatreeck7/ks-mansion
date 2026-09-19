/** Thai month abbreviations, indexed to match Date.getMonth(). */
export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;

/**
 * Full month names, for the one field that uses them.
 *
 * ใบแจ้งค่าห้องพัก heads itself `ยอดชำระเดือน : สิงหาคม`, spelled out, while
 * every other date on the same slip is abbreviated. That is the document's
 * own convention and it is reproduced rather than tidied — a tenant checking
 * this month's bill against last month's should find the same words.
 */
export const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const;

/** 'สิงหาคม' — the month alone, as ใบแจ้งค่าห้องพัก heads it. */
export function formatThaiMonthName(date: Date): string {
  return THAI_MONTHS_FULL[date.getMonth()]!;
}

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
 * Money. Thousands-grouped, and satang are kept — owner-decided.
 *
 * This used to round to whole baht on the stated grounds that satang are not
 * tracked. They are: a fractional meter dial makes the charge fractional
 * (`83.5 หน่วย × 6`), and rounding it away meant the bill's own derivation
 * line did not add up to its own total.
 *
 * A whole amount prints whole — `2,898`, not `2,898.00` — so the ordinary
 * bill reads exactly as it did, and satang appear only where they exist.
 * Never a bare one decimal: `501.2` is a quantity, `501.20` is money, and
 * a column of amounts that mixes the two is a column nobody can scan.
 */
export function formatBaht(amount: number): string {
  // Guard against binary-float noise before deciding whether it is whole:
  // 83.5 × 6 is 501.00000000000006, which is 501 baht and not a satang more.
  const satang = Math.round(amount * 100) / 100;
  return satang.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(satang) ? 0 : 2,
    maximumFractionDigits: 2,
  });
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
