import { describe, expect, it } from 'vitest';
import { formatThaiDate } from './thai';
import { parseThaiDate } from './thai-parse';

/** Local-time midnight, so comparisons match how dates are entered and shown. */
function localDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

describe('parseThaiDate — round trip with formatThaiDate', () => {
  it('reads back everything the formatter writes, across all 12 months', () => {
    // The formatter was previously shipped with only 3 of 12 months sampled;
    // parsing gets the full table from the start.
    for (let month = 1; month <= 12; month += 1) {
      const original = localDate(2026, month, 15);
      const parsed = parseThaiDate(formatThaiDate(original));
      expect(parsed?.getTime(), `month ${month}`).toBe(original.getTime());
    }
  });
});

describe('parseThaiDate — Thai month abbreviations', () => {
  it('parses the formatter’s own shape', () => {
    expect(parseThaiDate('1 มี.ค. 2568')).toEqual(localDate(2025, 3, 1));
  });

  it('tolerates a missing trailing dot and extra spacing', () => {
    expect(parseThaiDate('  1  มี.ค  2568 ')).toEqual(localDate(2025, 3, 1));
  });
});

describe('parseThaiDate — numeric forms', () => {
  it('parses slash-separated with a full BE year', () => {
    expect(parseThaiDate('1/3/2568')).toEqual(localDate(2025, 3, 1));
  });

  it('parses zero-padded and dash- or dot-separated', () => {
    expect(parseThaiDate('01/03/2568')).toEqual(localDate(2025, 3, 1));
    expect(parseThaiDate('01-03-2568')).toEqual(localDate(2025, 3, 1));
    expect(parseThaiDate('01.03.2568')).toEqual(localDate(2025, 3, 1));
  });

  it('expands a two-digit year as 25YY BE — the form the paperwork uses', () => {
    // Spec ref: "Existing files use BE years (69 = 2569)".
    expect(parseThaiDate('1/3/69')).toEqual(localDate(2026, 3, 1));
    expect(parseThaiDate('1/3/68')).toEqual(localDate(2025, 3, 1));
  });
});

describe('parseThaiDate — rejects rather than guessing', () => {
  it('returns null for empty or nonsense input', () => {
    for (const bad of ['', '   ', 'ไม่ทราบ', 'abc', '1/3', '1/3/4/5']) {
      expect(parseThaiDate(bad), bad).toBeNull();
    }
  });

  it('rejects an out-of-range day or month', () => {
    expect(parseThaiDate('0/3/2568')).toBeNull();
    expect(parseThaiDate('32/3/2568')).toBeNull();
    expect(parseThaiDate('1/0/2568')).toBeNull();
    expect(parseThaiDate('1/13/2568')).toBeNull();
  });

  it('rejects a day that does not exist in that month, instead of rolling over', () => {
    // new Date(2025, 1, 30) silently becomes 2 March — that must not pass.
    expect(parseThaiDate('30/2/2568')).toBeNull();
    expect(parseThaiDate('31/4/2568')).toBeNull();
  });

  it('accepts 29 February only in a Buddhist year that is really a leap year', () => {
    // 2567 BE = 2024 CE (leap); 2568 BE = 2025 CE (not).
    expect(parseThaiDate('29/2/2567')).toEqual(localDate(2024, 2, 29));
    expect(parseThaiDate('29/2/2568')).toBeNull();
  });

  it('rejects an unknown month word', () => {
    expect(parseThaiDate('1 xx. 2568')).toBeNull();
    expect(parseThaiDate('1 ม.ค 2568')).toEqual(localDate(2025, 1, 1));
  });

  it('rejects a Gregorian year rather than reading it as Buddhist', () => {
    // 2026 - 543 would be 1483: absurd, and silently wrong. Fail instead.
    expect(parseThaiDate('1/3/2026')).toBeNull();
    expect(parseThaiDate('1/3/1990')).toBeNull();
  });
});
