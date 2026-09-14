import { describe, expect, it } from 'vitest';
import {
  formatBaht,
  formatFigure,
  formatReading,
  formatReadingFigure,
  formatThaiDate,
  formatUnits,
  toBuddhistYear,
} from './thai';

describe('toBuddhistYear', () => {
  it('adds 543 to the Gregorian year', () => {
    expect(toBuddhistYear(2026)).toBe(2569);
    expect(toBuddhistYear(2025)).toBe(2568);
  });
});

describe('formatThaiDate', () => {
  it('formats as day, abbreviated Thai month, Buddhist year', () => {
    expect(formatThaiDate(new Date(2025, 2, 1))).toBe('1 มี.ค. 2568');
  });

  it('handles a two-digit day', () => {
    expect(formatThaiDate(new Date(2026, 7, 26))).toBe('26 ส.ค. 2569');
  });

  it('handles December, the last month index', () => {
    expect(formatThaiDate(new Date(2026, 11, 31))).toBe('31 ธ.ค. 2569');
  });

  it.each([
    [0, 'ม.ค.'],
    [1, 'ก.พ.'],
    [2, 'มี.ค.'],
    [3, 'เม.ย.'],
    [4, 'พ.ค.'],
    [5, 'มิ.ย.'],
    [6, 'ก.ค.'],
    [7, 'ส.ค.'],
    [8, 'ก.ย.'],
    [9, 'ต.ค.'],
    [10, 'พ.ย.'],
    [11, 'ธ.ค.'],
  ])('renders month index %i as %s', (monthIndex, abbreviation) => {
    expect(formatThaiDate(new Date(2026, monthIndex, 15))).toBe(`15 ${abbreviation} 2569`);
  });
});

describe('formatBaht', () => {
  it('groups thousands with commas and no decimals', () => {
    expect(formatBaht(3456)).toBe('3,456');
    expect(formatBaht(0)).toBe('0');
  });

  it('keeps satang, and shows two of them or none', () => {
    expect(formatBaht(501.2)).toBe('501.20');
    expect(formatBaht(2898.75)).toBe('2,898.75');
    expect(formatBaht(2898)).toBe('2,898');
  });

  // 83.5 units at ฿6 is 501.00000000000006 in binary floating point. That is
  // 501 baht; printing it as 501.00 would be the arithmetic showing through.
  it('does not turn float noise into a satang', () => {
    expect(formatBaht(83.5 * 6)).toBe('501');
  });

  it('rounds to the satang, never past it', () => {
    expect(formatBaht(100.005)).toBe('100.01');
    expect(formatBaht(100.004)).toBe('100');
  });
});

describe('formatFigure', () => {
  it('renders an em dash for null so empty ledger cells align', () => {
    expect(formatFigure(null)).toBe('—');
  });

  it('renders a grouped number otherwise', () => {
    expect(formatFigure(4182)).toBe('4,182');
  });
});

describe('formatReading', () => {
  it('keeps the fraction the sheet holds instead of rounding it away', () => {
    expect(formatReading(4215.6)).toBe('4,215.6');
    expect(formatReading(1677.5)).toBe('1,677.5');
  });

  it('prints a whole dial figure without a trailing decimal point', () => {
    expect(formatReading(4215)).toBe('4,215');
    expect(formatReading(0)).toBe('0');
  });

  it('caps precision so a float subtraction does not print its own noise', () => {
    // 1677.4 - 0 style arithmetic produces 1677.4000000000001 in binary
    // floating point; a dial has no such precision and neither should the
    // screen.
    expect(formatReading(1677.4000000000001)).toBe('1,677.4');
  });
});

describe('formatReadingFigure', () => {
  it('renders an em dash for null so empty ledger cells align', () => {
    expect(formatReadingFigure(null)).toBe('—');
  });

  it('keeps the fraction otherwise', () => {
    expect(formatReadingFigure(1677.5)).toBe('1,677.5');
  });
});

describe('formatUnits', () => {
  it('appends the Thai unit word', () => {
    expect(formatUnits(108)).toBe('108 หน่วย');
  });

  it('keeps a fractional consumption, which a dial difference can be', () => {
    expect(formatUnits(83.5)).toBe('83.5 หน่วย');
  });
});
