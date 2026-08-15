import { describe, expect, it } from 'vitest';
import { isLettable, type Room } from './room';

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

describe('the lettable/common union', () => {
  it('makes reading a rent rate off a common space a compile error', () => {
    // @ts-expect-error CommonRoom deliberately has no rentRate field. If this
    // union is ever widened (e.g. to `rentRate?: number`), the access below
    // becomes legal, this directive becomes unused, and `astro check` fails —
    // which is exactly the regression guard we want.
    const rate = laundry.rentRate;
    expect(rate).toBeUndefined();
  });
});
