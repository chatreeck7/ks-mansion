import { describe, expect, it } from 'vitest';
import { isLettable, rentRateOf, type Room } from './room';

const unit: Room = {
  id: '101', label: '101', floor: 1, kind: 'lettable', rentRate: 2800, hasMeter: true,
};
const laundry: Room = {
  id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common', hasMeter: true,
};

describe('isLettable', () => {
  it('is true for a rentable unit', () => {
    expect(isLettable(unit)).toBe(true);
  });

  it('is false for a common space', () => {
    expect(isLettable(laundry)).toBe(false);
  });
});

describe('rentRateOf', () => {
  it('returns the rate for a lettable unit', () => {
    expect(rentRateOf(unit)).toBe(2800);
  });

  it('returns null for a common space rather than throwing', () => {
    expect(rentRateOf(laundry)).toBeNull();
  });
});
