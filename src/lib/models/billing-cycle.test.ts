import { describe, expect, it } from 'vitest';
import { makeRoom } from '@/lib/test-support/fixtures';
import {
  chargeFor,
  chargeLabel,
  cycleFor,
  cycleIssuedIn,
  cycleLabel,
  isCollecting,
  isReadingDay,
  nextCycle,
  previousCycle,
  rentLabel,
  utilityLabel,
} from './billing-cycle';

/** The cycle issued 26 July 2025 (ก.ค. 2568). */
const july = cycleIssuedIn(2025, 6);

describe('cycleIssuedIn', () => {
  it('reads on the 25th–26th, issues on the 26th, falls due on the 10th', () => {
    expect(july.readFrom).toEqual(new Date(2025, 6, 25));
    expect(july.issueDate).toEqual(new Date(2025, 6, 26));
    expect(july.dueDate).toEqual(new Date(2025, 7, 10));
  });

  /**
   * The rule the collection form states on its own header, and the one most
   * likely to be got wrong:
   *
   *   ณ สิ้นเดือน ก.ค. [ เก็บค่าเช่าของ ส.ค., ค่าน้ำค่าไฟของ ก.ค. ]
   */
  it('charges next month rent and this month utilities', () => {
    expect(july.rentMonth).toEqual(new Date(2025, 7, 1));
    expect(july.utilityMonth).toEqual(new Date(2025, 6, 1));
  });

  it('has a sortable id off the issue month', () => {
    expect(july.id).toBe('2025-07');
    expect(cycleIssuedIn(2025, 11).id).toBe('2025-12');
  });

  it('rolls a December cycle into the next year', () => {
    const december = cycleIssuedIn(2025, 11);

    expect(december.dueDate).toEqual(new Date(2026, 0, 10));
    expect(december.rentMonth).toEqual(new Date(2026, 0, 1));
    expect(december.utilityMonth).toEqual(new Date(2025, 11, 1));
  });

  it('survives a month index that rolls over', () => {
    expect(cycleIssuedIn(2025, 12).id).toBe('2026-01');
    expect(cycleIssuedIn(2025, -1).id).toBe('2024-12');
  });
});

describe('cycleFor', () => {
  /**
   * The boundary is the 26th, not the 1st. Anchoring on the calendar month
   * would put the last five days of every month in the wrong cycle.
   */
  it('puts the 26th at the head of a new cycle', () => {
    expect(cycleFor(new Date(2025, 6, 26)).id).toBe('2025-07');
  });

  it('puts the 25th at the tail of the previous one', () => {
    expect(cycleFor(new Date(2025, 6, 25)).id).toBe('2025-06');
  });

  it('keeps the first days of a month in the cycle that is still collecting', () => {
    // 3 August is inside the window opened on 26 July.
    expect(cycleFor(new Date(2025, 7, 3)).id).toBe('2025-07');
  });

  it('handles January, where the previous cycle is last year', () => {
    expect(cycleFor(new Date(2026, 0, 5)).id).toBe('2025-12');
  });

  it('reads February the same way, short month or not', () => {
    expect(cycleFor(new Date(2025, 1, 26)).id).toBe('2025-02');
    expect(cycleFor(new Date(2025, 1, 25)).id).toBe('2025-01');
  });
});

describe('walking between cycles', () => {
  it('steps forward and back a month at a time', () => {
    expect(nextCycle(july).id).toBe('2025-08');
    expect(previousCycle(july).id).toBe('2025-06');
  });

  it('round-trips across a year boundary', () => {
    const december = cycleIssuedIn(2025, 11);
    expect(previousCycle(nextCycle(december)).id).toBe(december.id);
  });

  it("hands the next cycle the rent month that follows this one's", () => {
    expect(nextCycle(july).rentMonth).toEqual(new Date(2025, 8, 1));
    // And its utilities are the month this one charged rent for — the two
    // sequences are offset by one, permanently.
    expect(nextCycle(july).utilityMonth).toEqual(july.rentMonth);
  });
});

describe('isCollecting', () => {
  it('runs from the 26th to the 10th, both inclusive', () => {
    expect(isCollecting(july, new Date(2025, 6, 26))).toBe(true);
    expect(isCollecting(july, new Date(2025, 7, 1))).toBe(true);
    // A payment handed over on the due date is on time.
    expect(isCollecting(july, new Date(2025, 7, 10))).toBe(true);
  });

  it('excludes the day before it opens and the day after it closes', () => {
    expect(isCollecting(july, new Date(2025, 6, 25))).toBe(false);
    expect(isCollecting(july, new Date(2025, 7, 11))).toBe(false);
  });

  it('ignores the time of day', () => {
    expect(isCollecting(july, new Date(2025, 7, 10, 23, 59))).toBe(true);
  });
});

describe('isReadingDay', () => {
  it('covers the 25th and the 26th, so a round can span two evenings', () => {
    expect(isReadingDay(july, new Date(2025, 6, 25))).toBe(true);
    expect(isReadingDay(july, new Date(2025, 6, 26))).toBe(true);
  });

  it('rejects a day outside the round', () => {
    expect(isReadingDay(july, new Date(2025, 6, 24))).toBe(false);
    expect(isReadingDay(july, new Date(2025, 6, 27))).toBe(false);
  });
});

describe('chargeFor', () => {
  /**
   * The `จะได้รับ ณ สิ้นเดือน` column has YES / NO / Utility. The third state
   * is the whole reason `noticeGiven` exists as a room status.
   */
  it('charges an occupied room rent and utilities', () => {
    expect(chargeFor(makeRoom({ status: 'occupied' }))).toBe('rentAndUtilities');
  });

  it('charges a room under แจ้งออก utilities only', () => {
    // They are still using power this month, but there is no next month to
    // pay rent for.
    expect(chargeFor(makeRoom({ status: 'noticeGiven' }))).toBe('utilitiesOnly');
  });

  it('charges an empty room nothing', () => {
    expect(chargeFor(makeRoom({ status: 'available' }))).toBe('nothing');
    expect(chargeFor(makeRoom({ status: 'maintenance' }))).toBe('nothing');
  });

  it('labels all three for the report column', () => {
    expect(chargeLabel('rentAndUtilities')).toBe('ค่าเช่า + ค่าน้ำค่าไฟ');
    expect(chargeLabel('utilitiesOnly')).toBe('เฉพาะค่าน้ำค่าไฟ');
    expect(chargeLabel('nothing')).toBe('ไม่เก็บ');
  });
});

describe('labels', () => {
  it('names the collection window as it is walked', () => {
    expect(cycleLabel(july)).toBe('รอบ 26 ก.ค. 2568 – 10 ส.ค. 2568');
  });

  /** Each line says which month it is for, because they are not the same. */
  it('names the two months apart', () => {
    expect(rentLabel(july)).toBe('ค่าเช่าเดือน ส.ค. 2568');
    expect(utilityLabel(july)).toBe('ค่าน้ำค่าไฟเดือน ก.ค. 2568');
  });
});
