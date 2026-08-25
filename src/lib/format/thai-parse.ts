import { THAI_MONTHS_SHORT, fromBuddhistYear } from './thai';

/**
 * Plausible Buddhist years for this console's data: 2400–2600 BE is roughly
 * 1857–2057 CE. Narrow enough that a Gregorian year typed by mistake (2026)
 * falls outside and is rejected, rather than becoming 1483 CE silently.
 */
const MIN_BE_YEAR = 2400;
const MAX_BE_YEAR = 2600;

/** Month abbreviations without their dots, for lenient matching. */
const MONTH_KEYS = THAI_MONTHS_SHORT.map((m) => m.replace(/\./g, ''));

/**
 * Two-digit years in the collection paperwork mean 25YY BE — "69" is 2569,
 * not 1969 and not 2069. See this task's spec ref.
 */
function expandYear(raw: string): number {
  return raw.length <= 2 ? 2500 + Number(raw) : Number(raw);
}

/**
 * Build a local-midnight Date, returning null if the calendar rejects the
 * combination. `new Date(2025, 1, 30)` silently rolls into March, so the
 * round-trip check is what actually enforces "this day exists".
 */
function toDate(gregorianYear: number, month: number, day: number): Date | null {
  const date = new Date(gregorianYear, month - 1, day);
  const survived =
    date.getFullYear() === gregorianYear &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return survived ? date : null;
}

function resolve(day: number, month: number, buddhistYear: number): Date | null {
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (buddhistYear < MIN_BE_YEAR || buddhistYear > MAX_BE_YEAR) return null;
  return toDate(fromBuddhistYear(buddhistYear), month, day);
}

/**
 * Parses the Thai date forms an admin actually types: the shape
 * `formatThaiDate` emits ('1 มี.ค. 2568'), and numeric forms separated by
 * `/`, `-` or `.` with a two- or four-digit Buddhist year.
 *
 * Returns `null` rather than throwing — this reads user input, so "invalid"
 * is an expected outcome a form should render, not an exception. Nothing
 * here guesses: an unparseable or impossible date is rejected outright.
 *
 * Thai numerals (๐-๙) are deliberately not handled. Admin input is typed on
 * a keyboard and the sheet stores Arabic numerals; add it if that changes.
 */
export function parseThaiDate(input: string): Date | null {
  const text = input.trim();
  if (!text) return null;

  const numeric = text.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/);
  if (numeric) {
    const [, day, month, year] = numeric;
    return resolve(Number(day), Number(month), expandYear(year!));
  }

  const worded = text.match(/^(\d{1,2})\s+(\S+?)\s+(\d{2}|\d{4})$/);
  if (worded) {
    const [, day, monthWord, year] = worded;
    const index = MONTH_KEYS.indexOf(monthWord!.replace(/\./g, ''));
    if (index === -1) return null;
    return resolve(Number(day), index + 1, expandYear(year!));
  }

  return null;
}
