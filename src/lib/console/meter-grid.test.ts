import { describe, expect, it } from 'vitest';
import { makeMeterReading, makeRoom } from '@/lib/test-support/fixtures';
import type { LedgerInputCell } from '@/lib/models/ledger';
import { startRound } from './meter-round';
import {
  draftsFromForm,
  fieldName,
  METER_GRID_COLUMNS,
  toMeterGridGroups,
  type GridSubmission,
} from './meter-grid';

const ROOMS = [
  makeRoom({ id: '101', label: '101', floor: 1 }),
  makeRoom({ id: '102', label: '102', floor: 1 }),
  makeRoom({ id: 'laundry', label: 'ร้านซักผ้า', kind: 'common', floor: 1 }),
];

const FEB = new Date(2025, 1, 26);
const MAR = new Date(2025, 2, 26);

const HISTORY = [
  makeMeterReading({ id: 'm-001', roomId: '101', currentReading: 1256, ratePerUnit: 6, readDate: FEB }),
  makeMeterReading({ id: 'm-002', roomId: '102', currentReading: 1489, ratePerUnit: 6, readDate: FEB }),
  makeMeterReading({ id: 'm-003', roomId: 'laundry', meterType: 'electricity',
                    currentReading: 4343, ratePerUnit: 5, readDate: FEB }),
  makeMeterReading({ id: 'm-004', roomId: 'laundry', meterType: 'water',
                    currentReading: 816, ratePerUnit: 15, readDate: FEB }),
];

const round = startRound(ROOMS, HISTORY);
const stopOf = (key: string) => round.stops.find((s) => s.key === key)!;

function form(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

/** The drafts alone; the stop keys are asserted separately where they matter. */
function drafts(submission: GridSubmission) {
  return submission.entries.map((entry) => entry.draft);
}

describe('toMeterGridGroups', () => {
  it('renders one row per stop, so the laundry gets two', () => {
    const [group] = toMeterGridGroups(round, MAR);

    expect(group!.rows).toHaveLength(4);
    expect(group!.rows.filter((r) => r.id.startsWith('laundry'))).toHaveLength(2);
  });

  it('labels the group with the cycle it is recording', () => {
    expect(toMeterGridGroups(round, MAR)[0]!.label).toBe('รอบวันที่ 26 มี.ค. 2568');
  });

  it('supplies a cell for every declared column, as LedgerTable requires', () => {
    // LedgerTable throws at build time on a missing cell — this is the guard
    // that keeps that failure out of a page render.
    for (const row of toMeterGridGroups(round, MAR)[0]!.rows) {
      for (const column of METER_GRID_COLUMNS) {
        expect(row.cells[column.key], `${row.id} is missing "${column.key}"`).toBeDefined();
      }
    }
  });

  it('shows a recorded previous figure and rate as figures, not inputs', () => {
    const row = toMeterGridGroups(round, MAR)[0]!.rows.find((r) => r.id === '101:electricity')!;

    expect(row.cells.previous).toEqual({ kind: 'figure', value: 1256 });
    expect(row.cells.rate).toEqual({ kind: 'figure', value: 6 });
    expect(row.cells.current!.kind).toBe('input');
  });

  /** On the building's first round this is every row, not an odd one. */
  it('asks for the starting figure and rate when a meter has no history', () => {
    const fresh = toMeterGridGroups(startRound(ROOMS, []), MAR)[0]!.rows[0]!;

    expect(fresh.cells.previous!.kind).toBe('input');
    expect(fresh.cells.rate!.kind).toBe('input');
  });

  it('names each input by its meter, never by row position', () => {
    const row = toMeterGridGroups(round, MAR)[0]!.rows.find((r) => r.id === 'laundry:water')!;

    expect((row.cells.current as LedgerInputCell).name).toBe('current:laundry:water');
    // The accessible name has to say which meter — 27 identical inputs
    // otherwise all read the same to a screen reader.
    expect((row.cells.current as LedgerInputCell).label).toContain('ร้านซักผ้า');
    expect((row.cells.current as LedgerInputCell).label).toContain('น้ำ');
  });

  it('puts back what was typed, so one bad row does not clear the others', () => {
    const submitted = form({
      [fieldName(stopOf('101:electricity'), 'current')]: '1312',
      [fieldName(stopOf('102:electricity'), 'current')]: '1500',
    });
    const rows = toMeterGridGroups(round, MAR, submitted)[0]!.rows;

    expect((rows.find((r) => r.id === '101:electricity')!.cells.current as LedgerInputCell).value)
      .toBe('1312');
    expect((rows.find((r) => r.id === 'laundry:water')!.cells.current as LedgerInputCell).value)
      .toBe('');
  });
});

describe('draftsFromForm', () => {
  /**
   * The common use is correcting one meter out of 27. A blank row has to be
   * "nothing to record" or the ordinary case fails on 26 counts.
   */
  it('ignores rows left blank', () => {
    const result = draftsFromForm(round, form({}), MAR);

    expect(drafts(result)).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('records only the row that was filled in', () => {
    const result = draftsFromForm(
      round,
      form({ [fieldName(stopOf('101:electricity'), 'current')]: '1312' }),
      MAR,
    );

    expect(result.errors).toEqual([]);
    expect(drafts(result)).toEqual([
      {
        roomId: '101',
        meterType: 'electricity',
        readDate: MAR,
        previousReading: 1256,
        currentReading: 1312,
        ratePerUnit: 6,
        note: null,
      },
    ]);
  });

  it('keeps the laundry two meters apart, at their own rates', () => {
    const result = draftsFromForm(
      round,
      form({
        [fieldName(stopOf('laundry:electricity'), 'current')]: '4470',
        [fieldName(stopOf('laundry:water'), 'current')]: '851',
      }),
      MAR,
    );

    expect(drafts(result).map((d) => [d.meterType, d.ratePerUnit])).toEqual([
      ['electricity', 5],
      ['water', 15],
    ]);
  });

  it('names the room in an error rather than failing anonymously', () => {
    const result = draftsFromForm(
      round,
      form({ [fieldName(stopOf('102:electricity'), 'current')]: '1000' }),
      MAR,
    );

    expect(drafts(result)).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('102');
    expect(result.errors[0]).toContain('ถอยหลัง');
  });

  it('still records the good rows when one is wrong', () => {
    const result = draftsFromForm(
      round,
      form({
        [fieldName(stopOf('101:electricity'), 'current')]: '1312',
        [fieldName(stopOf('102:electricity'), 'current')]: '1',
      }),
      MAR,
    );

    expect(drafts(result).map((d) => d.roomId)).toEqual(['101']);
    expect(result.errors).toHaveLength(1);
  });

  it('takes the typed starting figure and rate for a meter with no history', () => {
    const fresh = startRound(ROOMS, []);
    const stop = fresh.stops[0]!;

    const result = draftsFromForm(
      fresh,
      form({
        [fieldName(stop, 'current')]: '1256',
        [fieldName(stop, 'previous')]: '1200',
        [fieldName(stop, 'rate')]: '6',
      }),
      MAR,
    );

    expect(drafts(result)[0]).toMatchObject({ previousReading: 1200, currentReading: 1256, ratePerUnit: 6 });
  });

  it('refuses a first-ever reading that omits the rate', () => {
    const fresh = startRound(ROOMS, []);
    const stop = fresh.stops[0]!;

    const result = draftsFromForm(
      fresh,
      form({ [fieldName(stop, 'current')]: '1256', [fieldName(stop, 'previous')]: '1200' }),
      MAR,
    );

    expect(drafts(result)).toEqual([]);
    expect(result.errors[0]).toContain('บาท/หน่วย');
  });

  it('tolerates the commas a pasted figure brings with it', () => {
    const result = draftsFromForm(
      round,
      form({ [fieldName(stopOf('laundry:electricity'), 'current')]: '4,470' }),
      MAR,
    );

    expect(drafts(result)[0]).toMatchObject({ currentReading: 4470 });
  });
});

describe('what comes back after a partial save', () => {
  const submitted = form({
    [fieldName(stopOf('101:electricity'), 'current')]: '1312',
    [fieldName(stopOf('102:electricity'), 'current')]: '1',
  });

  /**
   * A saved row that keeps its figure invites a second submit that appends
   * the same reading again — recorded, that time, as zero units against
   * itself. Found by driving the page, not by reading it.
   */
  it('clears a row that saved, and keeps the one that did not', () => {
    const rows = toMeterGridGroups(round, MAR, submitted, new Set(['101:electricity']))[0]!.rows;

    expect((rows.find((r) => r.id === '101:electricity')!.cells.current as LedgerInputCell).value)
      .toBe('');
    expect((rows.find((r) => r.id === '102:electricity')!.cells.current as LedgerInputCell).value)
      .toBe('1');
  });

  it('carries the stop key on every entry, so the page knows what landed', () => {
    expect(draftsFromForm(round, submitted, MAR).entries.map((e) => e.stopKey))
      .toEqual(['101:electricity']);
  });
});
