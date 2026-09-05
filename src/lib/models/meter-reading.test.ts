import { describe, expect, it } from 'vitest';
import { makeMeterReading } from '@/lib/test-support/fixtures';
import {
  isSameMeter,
  meterTypeLabel,
  readingCharge,
  unitsUsed,
} from './meter-reading';

describe('unitsUsed', () => {
  it('derives units from the two dial figures', () => {
    expect(unitsUsed(makeMeterReading({ previousReading: 1256, currentReading: 1312 }))).toBe(56);
  });

  it('is zero for a meter that did not move', () => {
    expect(unitsUsed(makeMeterReading({ previousReading: 400, currentReading: 400 }))).toBe(0);
  });
});

describe('readingCharge', () => {
  it('charges units at the rate stored on the reading, not a global one', () => {
    // The laundry's water meter at ฿15 against a room's ฿6 — the reason the
    // rate lives per reading.
    const water = makeMeterReading({
      meterType: 'water',
      previousReading: 786,
      currentReading: 816,
      ratePerUnit: 15,
    });

    expect(readingCharge(water)).toBe(450);
  });

  it('is zero when the meter did not move, whatever the rate', () => {
    expect(
      readingCharge(makeMeterReading({ previousReading: 90, currentReading: 90, ratePerUnit: 6 })),
    ).toBe(0);
  });
});

describe('isSameMeter', () => {
  /**
   * The laundry is the one space where room id alone does not identify a
   * meter, so this is the case the function exists for.
   */
  it('separates the laundry two meters', () => {
    const electricity = makeMeterReading({ roomId: 'laundry', meterType: 'electricity' });
    const water = makeMeterReading({ roomId: 'laundry', meterType: 'water' });

    expect(isSameMeter(electricity, water)).toBe(false);
    expect(isSameMeter(electricity, { roomId: 'laundry', meterType: 'electricity' })).toBe(true);
  });

  it('separates the same utility in different rooms', () => {
    expect(
      isSameMeter({ roomId: '101', meterType: 'electricity' }, { roomId: '102', meterType: 'electricity' }),
    ).toBe(false);
  });
});

describe('meterTypeLabel', () => {
  it('names both meters in Thai, as the round and the bill print them', () => {
    expect(meterTypeLabel('electricity')).toBe('ไฟฟ้า');
    expect(meterTypeLabel('water')).toBe('น้ำ');
  });
});
