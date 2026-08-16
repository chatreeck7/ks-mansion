import { describe, expect, it } from 'vitest';
import { isUnit, type Room } from './room';

const unit: Room = {
  id: '101', label: '101', floor: 1, kind: 'unit', rentRate: 2800, hasMeter: true,
};
const laundry: Room = {
  id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common', rentRate: null, hasMeter: true,
};

describe('isUnit', () => {
  it('is true for a residential unit', () => {
    expect(isUnit(unit)).toBe(true);
  });

  it('is false for a common space', () => {
    expect(isUnit(laundry)).toBe(false);
  });
});

describe('rentRate', () => {
  it('may be recorded on a common space — a laundry or undercroft can be rented out', () => {
    const rentedLaundry: Room = { ...laundry, rentRate: 4000 };
    expect(rentedLaundry.rentRate).toBe(4000);
  });
});
