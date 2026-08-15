import { describe, expect, it } from 'vitest';
import { formatBaht, formatFigure, formatThaiDate, formatUnits, toBuddhistYear } from './thai';

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
});

describe('formatBaht', () => {
  it('groups thousands with commas and no decimals', () => {
    expect(formatBaht(3456)).toBe('3,456');
    expect(formatBaht(0)).toBe('0');
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

describe('formatUnits', () => {
  it('appends the Thai unit word', () => {
    expect(formatUnits(108)).toBe('108 หน่วย');
  });
});
