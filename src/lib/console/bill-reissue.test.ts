import { describe, expect, it } from 'vitest';
import { makeBill, makeLease, makeMeterReading, makeRoom } from '@/lib/test-support/fixtures';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import { inReissueWindow, reissuePlan } from './bill-reissue';

/** Issued 26 มี.ค. 2568 (cycle 2025-03). */
const CYCLE = cycleIssuedIn(2025, 2);
const READ_DAY = new Date(2025, 2, 26);
/** Early April: the March bills are the ones being collected. */
const COLLECTING = new Date(2025, 3, 5);

const rooms = [makeRoom({ id: '210', label: '210', floor: 2, rentRate: 2500 })];
const leases = [makeLease({ id: 'l-210', roomId: '210', startDate: new Date(2024, 0, 1), rentRate: 2500, occupantCount: 2 })];
// The corrected dial: 10,445 → 10,560 (the bill went out with 10,523).
const readings = [
  makeMeterReading({ id: 'm-2', roomId: '210', previousReading: 10445, currentReading: 10560, ratePerUnit: 7, readDate: READ_DAY }),
];
const wrong = makeBill({
  id: 'b-030',
  roomId: '210',
  leaseId: 'l-210',
  cycle: CYCLE.id,
  rentAmount: 2500,
  electricityAmount: 546,
  waterAmount: 200,
  electricityPrevious: 10445,
  electricityCurrent: 10523,
  waterQuantity: 2,
});

describe('reissuePlan', () => {
  it('works the room again from the corrected reading', () => {
    const plan = reissuePlan({ bill: wrong, rooms, leases, readings, existing: [wrong], now: COLLECTING });
    expect(plan.problem).toBeNull();
    expect(plan.changed).toBe(true);
    expect(plan.draft).toMatchObject({
      roomId: '210',
      cycle: CYCLE.id,
      electricityPrevious: 10445,
      electricityCurrent: 10560,
      electricityAmount: 115 * 7,
    });
  });

  it('says nothing changed when the figures still match', () => {
    const same = { ...wrong, electricityCurrent: 10560, electricityAmount: 805 };
    const plan = reissuePlan({ bill: same, rooms, leases, readings, existing: [same], now: COLLECTING });
    expect(plan.problem).toBeNull();
    expect(plan.changed).toBe(false);
  });

  it('refuses once another bill stands for the room and cycle', () => {
    const replacement = { ...wrong, id: 'b-031' };
    const plan = reissuePlan({ bill: { ...wrong, archived: true }, rooms, leases, readings, existing: [replacement], now: COLLECTING });
    expect(plan.draft).toBeNull();
    expect(plan.problem).toContain('b-031');
  });

  it('refuses a closed month', () => {
    const plan = reissuePlan({ bill: wrong, rooms, leases, readings, existing: [wrong], now: new Date(2025, 5, 5) });
    expect(plan.draft).toBeNull();
    expect(plan.problem).toContain('ปิดไปแล้ว');
  });
});

describe('inReissueWindow', () => {
  it('takes the cycle being issued and the one being collected, nothing older', () => {
    expect(inReissueWindow('2025-04', COLLECTING)).toBe(true);
    expect(inReissueWindow('2025-03', COLLECTING)).toBe(true);
    expect(inReissueWindow('2025-02', COLLECTING)).toBe(false);
  });
});
