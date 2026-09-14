import { describe, expect, it } from 'vitest';
import { makeMeterReading, makeRoom } from '@/lib/test-support/fixtures';
import type { MeterReading } from '@/lib/models/meter-reading';
import type { Room } from '@/lib/models/room';
import {
  canClose,
  closeRound,
  currentStop,
  enterReading,
  isResolved,
  metersFrom,
  progress,
  skipStop,
  startRound,
  stopUsage,
  type Round,
  type RoundStop,
} from './meter-round';

/**
 * A miniature building with the shape that matters: two units on a floor, a
 * laundry carrying two meters, and an undercroft carrying none.
 */
const ROOMS: Room[] = [
  makeRoom({ id: '102', label: '102', floor: 1 }),
  makeRoom({ id: '101', label: '101', floor: 1 }),
  makeRoom({ id: '201', label: '201', floor: 2 }),
  makeRoom({ id: 'laundry', label: 'ร้านซักผ้า', kind: 'common', floor: 1 }),
  makeRoom({ id: 'undercroft', label: 'ห้องใต้ถุน', kind: 'common', floor: 0, hasMeter: false }),
];

const FEB = new Date(2025, 1, 26);
const MAR = new Date(2025, 2, 26);

/** Last cycle's readings — what a new round continues from. */
const HISTORY: MeterReading[] = [
  makeMeterReading({ id: 'm-001', roomId: '101', previousReading: 1200, currentReading: 1256,
                     ratePerUnit: 6, readDate: FEB }),
  makeMeterReading({ id: 'm-002', roomId: '102', previousReading: 1400, currentReading: 1489,
                     ratePerUnit: 6, readDate: FEB }),
  makeMeterReading({ id: 'm-003', roomId: '201', previousReading: 900, currentReading: 950,
                     ratePerUnit: 6, readDate: FEB }),
  makeMeterReading({ id: 'm-004', roomId: 'laundry', meterType: 'electricity',
                     previousReading: 4215, currentReading: 4343, ratePerUnit: 5, readDate: FEB }),
  makeMeterReading({ id: 'm-005', roomId: 'laundry', meterType: 'water',
                     previousReading: 786, currentReading: 816, ratePerUnit: 15, readDate: FEB }),
];

/** Answers every stop the round offers, until it has none left. */
function walk(start: Round, answer: (round: Round, stop: RoundStop) => Round): Round {
  let current = start;
  // The round must terminate on its own; the guard is here so a regression
  // that loops fails as a test rather than as a hung suite.
  for (let guard = 0; guard < 50 && currentStop(current); guard += 1) {
    current = answer(current, currentStop(current)!);
  }
  return current;
}

/** Answers stops only until the round turns back for เก็บตก. */
function walkFirstPass(start: Round, answer: (round: Round, stop: RoundStop) => Round): Round {
  let current = start;
  for (let guard = 0; guard < 50 && currentStop(current) && !current.sweeping; guard += 1) {
    current = answer(current, currentStop(current)!);
  }
  return current;
}

/** The ordinary answer: ten more units than last cycle. */
function readTenMore(round: Round, stop: RoundStop): Round {
  return enterReading(round, { currentReading: stop.previousReading! + 10 });
}

describe('metersFrom', () => {
  it('walks the laundry twice — the round is meters, not rooms', () => {
    const meters = metersFrom(ROOMS, HISTORY);

    expect(meters.filter((m) => m.roomId === 'laundry')).toEqual([
      { roomId: 'laundry', meterType: 'electricity' },
      { roomId: 'laundry', meterType: 'water' },
    ]);
    // Four metered spaces, five stops. Any count off the room list is wrong.
    expect(meters).toHaveLength(5);
  });

  it('sequences stops in walking order, common spaces last', () => {
    expect(metersFrom(ROOMS, HISTORY).map((m) => m.roomId)).toEqual([
      '101', '102', '201', 'laundry', 'laundry',
    ]);
  });

  it('leaves out a space with no meter', () => {
    expect(metersFrom(ROOMS, HISTORY).some((m) => m.roomId === 'undercroft')).toBe(false);
  });

  /**
   * The rooms tab records one meter fact — `hasMeter` — so a second meter can
   * only be known from the fact that someone has read it.
   */
  it('discovers a second meter from history alone', () => {
    const withoutHistory = metersFrom(ROOMS, []);
    expect(withoutHistory.filter((m) => m.roomId === 'laundry')).toEqual([
      { roomId: 'laundry', meterType: 'electricity' },
    ]);

    const waterOnly = [makeMeterReading({ roomId: 'laundry', meterType: 'water' })];
    expect(metersFrom(ROOMS, waterOnly).filter((m) => m.roomId === 'laundry')).toHaveLength(2);
  });

  it('treats a reading as evidence of a meter the registry does not flag', () => {
    // The undercroft says hasMeter: false, but somebody has read one.
    const meters = metersFrom(ROOMS, [makeMeterReading({ roomId: 'undercroft' })]);
    expect(meters.some((m) => m.roomId === 'undercroft')).toBe(true);
  });

  it('does not walk an archived room', () => {
    const rooms = ROOMS.map((r) => (r.id === '201' ? { ...r, archived: true } : r));
    expect(metersFrom(rooms, HISTORY).some((m) => m.roomId === '201')).toBe(false);
  });

  it('ignores a reading for a room the registry has never heard of', () => {
    const meters = metersFrom(ROOMS, [makeMeterReading({ roomId: '999' })]);
    expect(meters.some((m) => m.roomId === '999')).toBe(false);
  });
});

describe('startRound', () => {
  it('opens on the first stop, with nothing read', () => {
    const round = startRound(ROOMS, HISTORY);

    expect(currentStop(round)?.roomLabel).toBe('101');
    expect(progress(round)).toMatchObject({ total: 5, resolved: 0, entered: 0, pass: 'first' });
  });

  it('carries the previous figure and rate forward per meter', () => {
    const round = startRound(ROOMS, HISTORY);
    const byKey = new Map(round.stops.map((s) => [s.key, s]));

    expect(byKey.get('101:electricity')).toMatchObject({ previousReading: 1256, ratePerUnit: 6 });
    // The laundry's two meters continue from different dials at different rates.
    expect(byKey.get('laundry:electricity')).toMatchObject({ previousReading: 4343, ratePerUnit: 5 });
    expect(byKey.get('laundry:water')).toMatchObject({ previousReading: 816, ratePerUnit: 15 });
  });

  it('leaves a never-read meter with no figure to continue from', () => {
    const round = startRound(ROOMS, []);
    expect(round.stops[0]).toMatchObject({ previousReading: null, ratePerUnit: null });
  });

  it('takes the later of two readings on one date, as a correction should', () => {
    const corrected = [
      makeMeterReading({ id: 'm-010', roomId: '101', currentReading: 1500, readDate: MAR }),
      makeMeterReading({ id: 'm-011', roomId: '101', currentReading: 1590, readDate: MAR }),
    ];
    const round = startRound(ROOMS, corrected);

    expect(round.stops[0]?.previousReading).toBe(1590);
  });

  it('names the stop by the label an admin would recognise', () => {
    const round = startRound(ROOMS, HISTORY);
    expect(round.stops.map((s) => s.roomLabel)).toContain('ร้านซักผ้า');
  });
});

describe('entering a reading', () => {
  it('records the figure and moves to the next stop', () => {
    const round = enterReading(startRound(ROOMS, HISTORY), { currentReading: 1312 });

    expect(round.stops[0]).toMatchObject({ state: 'entered', currentReading: 1312 });
    expect(currentStop(round)?.roomLabel).toBe('102');
    expect(progress(round)).toMatchObject({ entered: 1, resolved: 1 });
  });

  it('derives usage rather than storing it', () => {
    const round = enterReading(startRound(ROOMS, HISTORY), { currentReading: 1312 });
    expect(stopUsage(round.stops[0]!)).toBe(56);
  });

  it('has no usage to show before a figure is entered', () => {
    expect(stopUsage(startRound(ROOMS, HISTORY).stops[0]!)).toBeNull();
  });

  /**
   * The same rule the repository enforces on write — applied here so it fails
   * while the person is still standing in front of the meter, rather than
   * after 28 more stops.
   */
  it('refuses a figure below the one it continues from', () => {
    expect(() => enterReading(startRound(ROOMS, HISTORY), { currentReading: 1200 })).toThrow(
      /does not run backwards/,
    );
  });

  it('asks for the previous figure when the meter has never been read', () => {
    expect(() => enterReading(startRound(ROOMS, []), { currentReading: 1312 })).toThrow(
      /never been read/,
    );
  });

  it('accepts a first-ever reading when both figures are given', () => {
    const round = enterReading(startRound(ROOMS, []), {
      previousReading: 1200,
      currentReading: 1256,
      ratePerUnit: 6,
    });

    expect(round.stops[0]).toMatchObject({ previousReading: 1200, currentReading: 1256 });
    expect(stopUsage(round.stops[0]!)).toBe(56);
  });

  it('asks for a rate when the meter has none on record', () => {
    expect(() =>
      enterReading(startRound(ROOMS, []), { previousReading: 1200, currentReading: 1256 }),
    ).toThrow(/บาท\/หน่วย/);
  });

  it('lets a changed rate override the one carried forward', () => {
    const round = enterReading(startRound(ROOMS, HISTORY), {
      currentReading: 1312,
      ratePerUnit: 7,
    });

    expect(round.stops[0]?.ratePerUnit).toBe(7);
  });

  it('keeps a note, and treats a blank one as no note', () => {
    const withNote = enterReading(startRound(ROOMS, HISTORY), {
      currentReading: 1312,
      note: '  อ่านซ้ำ  ',
    });
    expect(withNote.stops[0]?.note).toBe('อ่านซ้ำ');

    const blank = enterReading(startRound(ROOMS, HISTORY), { currentReading: 1312, note: '   ' });
    expect(blank.stops[0]?.note).toBeNull();
  });

  it('does not mutate the round it was given', () => {
    const before = startRound(ROOMS, HISTORY);
    enterReading(before, { currentReading: 1312 });

    expect(before.stops[0]?.state).toBe('unread');
    expect(before.cursor).toBe(0);
  });
});

describe('ข้าม and the เก็บตก sweep', () => {
  it('leaves a skipped stop unresolved on the first pass', () => {
    const round = skipStop(startRound(ROOMS, HISTORY), 'ไม่อยู่');

    expect(round.stops[0]).toMatchObject({ state: 'skipped', note: 'ไม่อยู่' });
    expect(isResolved(round.stops[0]!)).toBe(false);
    expect(progress(round)).toMatchObject({ deferred: 1, resolved: 0 });
  });

  it('turns back to the skipped stops after the last one', () => {
    // Skip 101, read the rest.
    const round = walkFirstPass(skipStop(startRound(ROOMS, HISTORY), 'ประตูล็อก'), readTenMore);

    expect(round.sweeping).toBe(true);
    expect(currentStop(round)?.roomLabel).toBe('101');
    expect(progress(round).pass).toBe('sweep');
  });

  it('resolves a deferred stop when the sweep gets the reading', () => {
    const round = walk(skipStop(startRound(ROOMS, HISTORY)), (r, stop) =>
      enterReading(r, { currentReading: stop.previousReading! + (stop.state === 'skipped' ? 5 : 10) }),
    );

    expect(round.stops[0]).toMatchObject({ state: 'entered', currentReading: 1261 });
    expect(canClose(round)).toBe(true);
  });

  /**
   * The rule the sweep exists for: one ข้าม defers, and being asked again and
   * saying ข้าม again is what makes it a decision.
   */
  it('resolves a stop that is skipped a second time, in the sweep', () => {
    const round = walk(skipStop(startRound(ROOMS, HISTORY), 'ไม่อยู่'), (r, stop) =>
      stop.state === 'skipped' ? skipStop(r, 'ยังไม่อยู่') : readTenMore(r, stop),
    );

    expect(round.stops[0]).toMatchObject({ state: 'skipped', skippedInSweep: true });
    expect(isResolved(round.stops[0]!)).toBe(true);
    expect(canClose(round)).toBe(true);
    expect(progress(round)).toMatchObject({ pass: 'complete', deferred: 0, entered: 4 });
  });

  it('ends the round once nothing is left to offer', () => {
    const round = walk(startRound(ROOMS, HISTORY), readTenMore);

    expect(currentStop(round)).toBeNull();
    expect(progress(round).pass).toBe('complete');
  });

  it('refuses an answer once the round has nothing open', () => {
    const round = walk(startRound(ROOMS, HISTORY), readTenMore);

    expect(() => enterReading(round, { currentReading: 1 })).toThrow(/no stop open/);
    expect(() => skipStop(round)).toThrow(/no stop open/);
  });

  it('keeps the reason from the first ข้าม when the sweep adds none', () => {
    const round = walk(skipStop(startRound(ROOMS, HISTORY), 'ประตูล็อก'), (r, stop) =>
      stop.state === 'skipped' ? skipStop(r) : readTenMore(r, stop),
    );

    expect(round.stops[0]?.note).toBe('ประตูล็อก');
  });
});

describe('closing the round', () => {
  it('will not close while a stop is unresolved', () => {
    const round = skipStop(startRound(ROOMS, HISTORY), 'ไม่อยู่');

    expect(canClose(round)).toBe(false);
    expect(() => closeRound(round, MAR)).toThrow(/not finished/);
    // The message names the stop, so it is actionable without hunting.
    expect(() => closeRound(round, MAR)).toThrow(/101/);
  });

  it('hands back one draft per stop that was read', () => {
    const round = walk(startRound(ROOMS, HISTORY), readTenMore);
    const drafts = closeRound(round, MAR);

    expect(drafts).toHaveLength(5);
    expect(drafts[0]).toEqual({
      roomId: '101',
      meterType: 'electricity',
      readDate: MAR,
      previousReading: 1256,
      currentReading: 1266,
      ratePerUnit: 6,
      note: null,
    });
    // Both laundry meters come out, at their own rates.
    expect(drafts.filter((d) => d.roomId === 'laundry').map((d) => d.ratePerUnit)).toEqual([5, 15]);
  });

  /**
   * A meter that was not read has no reading. Inventing a zero-usage row
   * would put a fabricated figure into append-only history that a bill is
   * later reconstructed from.
   */
  it('writes nothing for a stop that was skipped for good', () => {
    const round = walk(skipStop(startRound(ROOMS, HISTORY), 'ไม่อยู่'), (r, stop) =>
      stop.state === 'skipped' ? skipStop(r) : readTenMore(r, stop),
    );

    const drafts = closeRound(round, MAR);

    expect(drafts).toHaveLength(4);
    expect(drafts.some((d) => d.roomId === '101')).toBe(false);
  });

  it('refuses a round with no meters at all', () => {
    const round = startRound([makeRoom({ id: 'x', hasMeter: false })], []);

    expect(canClose(round)).toBe(false);
    expect(() => closeRound(round, MAR)).toThrow(/no stops/);
  });
});
