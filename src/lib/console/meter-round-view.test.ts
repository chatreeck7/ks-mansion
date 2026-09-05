import { describe, expect, it } from 'vitest';
import { makeMeterReading, makeRoom } from '@/lib/test-support/fixtures';
import { startRound, type RoundStop } from './meter-round';
import { describeProgress, describeStop, previewEntry } from './meter-round-view';

function stop(overrides: Partial<RoundStop> = {}): RoundStop {
  return {
    key: '101:electricity',
    roomId: '101',
    meterType: 'electricity',
    roomLabel: '101',
    previousReading: 1256,
    ratePerUnit: 6,
    state: 'unread',
    currentReading: null,
    note: null,
    skippedInSweep: false,
    ...overrides,
  };
}

describe('describeStop', () => {
  it('prints the figures a reader needs, formatted', () => {
    expect(describeStop(stop({ previousReading: 4343, ratePerUnit: 5 }))).toMatchObject({
      roomLabel: '101',
      meterLabel: 'ไฟฟ้า',
      previousText: '4,343',
      rateText: '5 บาท/หน่วย',
      needsPreviousReading: false,
      needsRate: false,
    });
  });

  it('names the laundry two meters differently', () => {
    expect(describeStop(stop({ roomLabel: 'ร้านซักผ้า', meterType: 'water' })).meterLabel).toBe('น้ำ');
  });

  /**
   * The building's first round is 27 of these, not one — `meter_readings`
   * starts empty. It is the normal case, so the screen asks rather than
   * showing a broken-looking blank.
   */
  it('asks for the starting figures when a meter has never been read', () => {
    const view = describeStop(stop({ previousReading: null, ratePerUnit: null }));

    expect(view).toMatchObject({
      previousText: null,
      rateText: null,
      needsPreviousReading: true,
      needsRate: true,
    });
  });

  it('carries the deferral reason so the sweep knows why it came back', () => {
    expect(describeStop(stop({ state: 'skipped', note: 'ประตูล็อก' })).deferredNote).toBe('ประตูล็อก');
    expect(describeStop(stop({ state: 'unread', note: 'อ่านซ้ำ' })).deferredNote).toBeNull();
  });
});

describe('describeProgress', () => {
  it('counts stops, not rooms', () => {
    const view = describeProgress({
      total: 27, resolved: 12, entered: 11, deferred: 1, pass: 'first',
    });

    expect(view.countText).toBe('จดแล้ว 12 จาก 27 จุด');
    expect(view.passLabel).toBeNull();
  });

  it('marks the sweep, so the second pass is unmistakable', () => {
    const view = describeProgress({
      total: 27, resolved: 26, entered: 26, deferred: 1, pass: 'sweep',
    });

    expect(view.passLabel).toBe('เก็บตก');
    expect(view.fraction).toBeCloseTo(26 / 27);
  });

  it('does not divide by zero on a round with no stops', () => {
    expect(
      describeProgress({ total: 0, resolved: 0, entered: 0, deferred: 0, pass: 'complete' }).fraction,
    ).toBe(0);
  });
});

describe('previewEntry', () => {
  it('says nothing until something is typed', () => {
    expect(previewEntry(stop(), { currentReading: '' })).toEqual({ status: 'empty' });
  });

  it('shows units and the charge they come to', () => {
    expect(previewEntry(stop(), { currentReading: '1312' })).toMatchObject({
      status: 'ok',
      units: 56,
      charge: 336,
      summary: 'ใช้ไป 56 หน่วย = 336 บาท',
    });
  });

  it('tolerates the commas a keypad and a paper form both produce', () => {
    expect(previewEntry(stop({ previousReading: 4343 }), { currentReading: '4,470' })).toMatchObject({
      status: 'ok',
      units: 127,
    });
  });

  it('rejects something that is not a number', () => {
    expect(previewEntry(stop(), { currentReading: '12ab' })).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('ตัวเลข'),
    });
  });

  /**
   * The rule the repository would refuse on write, said here first — while
   * the person is still standing in front of the meter.
   */
  it('catches a reading below the previous one, and names the figure', () => {
    expect(previewEntry(stop(), { currentReading: '1200' })).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('1,256'),
    });
  });

  it('accepts a meter that did not move', () => {
    expect(previewEntry(stop(), { currentReading: '1256' })).toMatchObject({
      status: 'ok',
      units: 0,
      charge: 0,
    });
  });

  describe('a meter with no history', () => {
    const fresh = stop({ previousReading: null, ratePerUnit: null });

    it('asks for the previous figure before it will compute anything', () => {
      expect(previewEntry(fresh, { currentReading: '1256' })).toMatchObject({
        status: 'invalid',
        message: expect.stringContaining('ครั้งก่อน'),
      });
    });

    it('asks for the rate once the previous figure is in', () => {
      expect(
        previewEntry(fresh, { currentReading: '1256', previousReading: '1200' }),
      ).toMatchObject({ status: 'invalid', message: expect.stringContaining('บาท/หน่วย') });
    });

    it('computes once both are supplied', () => {
      expect(
        previewEntry(fresh, { currentReading: '1256', previousReading: '1200', ratePerUnit: '6' }),
      ).toMatchObject({
        status: 'ok',
        previousReading: 1200,
        ratePerUnit: 6,
        units: 56,
        charge: 336,
      });
    });

    it('still checks the typed previous figure against the reading', () => {
      expect(
        previewEntry(fresh, { currentReading: '1100', previousReading: '1200', ratePerUnit: '6' }),
      ).toMatchObject({ status: 'invalid', message: expect.stringContaining('ถอยหลัง') });
    });
  });

  it('prefers what is on record over anything typed into the extra fields', () => {
    // The fields are not rendered for a stop that has history, but a stale
    // value must not be able to override the recorded one either way.
    const preview = previewEntry(stop(), {
      currentReading: '1312',
      previousReading: '9999',
      ratePerUnit: '999',
    });

    expect(preview).toMatchObject({ previousReading: 1256, ratePerUnit: 6, units: 56 });
  });
});

describe('over a real round', () => {
  it('describes the first stop of a building that has never been read', () => {
    const rooms = [
      makeRoom({ id: '101', label: '101', floor: 1 }),
      makeRoom({ id: 'laundry', label: 'ร้านซักผ้า', kind: 'common', floor: 1 }),
    ];
    const round = startRound(rooms, []);

    expect(describeStop(round.stops[0]!)).toMatchObject({
      roomLabel: '101',
      needsPreviousReading: true,
      needsRate: true,
    });
    expect(describeProgress({ total: round.stops.length, resolved: 0, entered: 0, deferred: 0, pass: 'first' }).countText)
      .toBe('จดแล้ว 0 จาก 2 จุด');
  });

  it('needs neither extra field once a cycle has been recorded', () => {
    const rooms = [makeRoom({ id: '101', label: '101', floor: 1 })];
    const round = startRound(rooms, [makeMeterReading({ roomId: '101', currentReading: 1256, ratePerUnit: 6 })]);

    expect(describeStop(round.stops[0]!)).toMatchObject({
      previousText: '1,256',
      needsPreviousReading: false,
      needsRate: false,
    });
  });
});
