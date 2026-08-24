/** Thai month abbreviations, indexed to match Date.getMonth(). */
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;

/** The Buddhist calendar runs 543 years ahead of the Gregorian one. */
export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + 543;
}

/** '1 มี.ค. 2568'. Reads the date in local time, matching how it was entered. */
export function formatThaiDate(date: Date): string {
  const day = date.getDate();
  const month = THAI_MONTHS_SHORT[date.getMonth()];
  const year = toBuddhistYear(date.getFullYear());
  return `${day} ${month} ${year}`;
}

/** Thousands-grouped, no decimals — satang are not tracked. */
export function formatBaht(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** A ledger figure, or an em dash when there is no value. */
export function formatFigure(value: number | null): string {
  return value === null ? '—' : formatBaht(value);
}

export function formatUnits(units: number): string {
  return `${formatBaht(units)} หน่วย`;
}
