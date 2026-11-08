import { describe, expect, it } from 'vitest';
import { addDays, addMonths, monthGrid, parseIso, thaiLabel, thaiLongLabel, toIso, withinRange } from './calendar';

describe('calendar', () => {
  it('reads and writes what a form posts', () => {
    expect(parseIso('2026-11-08')).toEqual({ year: 2026, month: 10, day: 8 });
    expect(parseIso('2026-02-30')).toBeNull();
    expect(parseIso('8/11/2569')).toBeNull();
    expect(toIso({ year: 2026, month: 0, day: 5 })).toBe('2026-01-05');
  });

  it('labels in พ.ศ.', () => {
    expect(thaiLabel({ year: 2026, month: 10, day: 8 })).toBe('8 พ.ย. 2569');
    expect(thaiLongLabel({ year: 2026, month: 10, day: 8 })).toBe('วันอาทิตย์ที่ 8 พฤศจิกายน 2569');
  });

  it('moves across month ends and clamps short months', () => {
    expect(addDays({ year: 2026, month: 11, day: 31 }, 1)).toEqual({ year: 2027, month: 0, day: 1 });
    expect(addMonths({ year: 2027, month: 0, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 28 });
  });

  it('lays a month on six Sunday-first weeks', () => {
    const grid = monthGrid(2026, 10); // พ.ย. 2569 starts on a Sunday
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ year: 2026, month: 10, day: 1 });
    expect(monthGrid(2026, 9)[0]).toEqual({ year: 2026, month: 8, day: 27 });
  });

  it('respects min and max', () => {
    const min = parseIso('2026-11-01');
    const max = parseIso('2026-11-08');
    expect(withinRange({ year: 2026, month: 10, day: 9 }, min, max)).toBe(false);
    expect(withinRange({ year: 2026, month: 10, day: 8 }, min, max)).toBe(true);
  });
});
