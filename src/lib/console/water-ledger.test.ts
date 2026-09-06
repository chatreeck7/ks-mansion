import { describe, expect, it } from 'vitest';
import { makeLease, makeMeterReading, makeRoom } from '@/lib/test-support/fixtures';
import type { LedgerInputCell } from '@/lib/models/ledger';
import {
  occupantFieldName,
  occupantUpdatesFromForm,
  toWaterGroups,
  waterRows,
  waterTotal,
  WATER_COLUMNS,
} from './water-ledger';

const CYCLE = new Date(2025, 2, 26);

const ROOMS = [
  makeRoom({ id: '101', label: '101', floor: 1 }),
  makeRoom({ id: '102', label: '102', floor: 1 }),
  makeRoom({ id: '103', label: '103', floor: 1, status: 'available' }),
  makeRoom({ id: 'laundry', label: 'ร้านซักผ้า', kind: 'common', floor: 1 }),
];

const LEASES = [
  makeLease({ id: 'l-101', roomId: '101', startDate: new Date(2025, 0, 1), occupantCount: 2 }),
  makeLease({ id: 'l-102', roomId: '102', startDate: new Date(2025, 0, 1), occupantCount: 1 }),
  makeLease({ id: 'l-laundry', roomId: 'laundry', startDate: new Date(2025, 0, 1), occupantCount: 0 }),
  // Ended before the cycle — 103 is vacant on the day being billed.
  makeLease({
    id: 'l-old',
    roomId: '103',
    startDate: new Date(2024, 0, 1),
    endDate: new Date(2024, 11, 31),
    occupantCount: 1,
  }),
];

/** The laundry's real meter: 4484 → 4529 is 45 units at ฿15. */
const READINGS = [
  makeMeterReading({
    id: 'm-w', roomId: 'laundry', meterType: 'water',
    previousReading: 4484, currentReading: 4529, ratePerUnit: 15, readDate: CYCLE,
  }),
];

function form(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

const rows = waterRows(ROOMS, LEASES, READINGS, CYCLE);
const rowFor = (roomId: string) => rows.find((r) => r.roomId === roomId)!;

describe('waterRows', () => {
  it('charges a room by headcount at ฿100 a person', () => {
    expect(rowFor('101')).toMatchObject({ basis: 'occupancy', occupantCount: 2, charge: 200 });
    expect(rowFor('102')).toMatchObject({ basis: 'occupancy', occupantCount: 1, charge: 100 });
  });

  /**
   * The exception the card exists to keep visible: a single "manual amount"
   * column would have covered both cases and lost why each figure is what it
   * is.
   */
  it('charges ร้านซักผ้า off its meter, not off a headcount', () => {
    expect(rowFor('laundry')).toMatchObject({
      basis: 'metered',
      occupantCount: null,
      units: 45,
      charge: 675,
    });
  });

  it('leaves out a room nobody is renting on that day', () => {
    // A zero in a column of real charges reads like a figure someone forgot.
    expect(rows.some((r) => r.roomId === '103')).toBe(false);
  });

  it('keeps the rooms in walking order', () => {
    expect(rows.map((r) => r.roomId)).toEqual(['101', '102', 'laundry']);
  });

  it('has no charge for a metered room whose meter has never been read', () => {
    const unread = waterRows(ROOMS, LEASES, [], CYCLE);
    // With no water reading anywhere, the laundry falls back to occupancy —
    // which is the honest reading of the data, since a meter is only known
    // to exist once something has been read off it.
    expect(unread.find((r) => r.roomId === 'laundry')).toMatchObject({ basis: 'occupancy' });
  });

  it('totals what the cycle bills for water', () => {
    expect(waterTotal(rows)).toBe(200 + 100 + 675);
  });
});

describe('toWaterGroups', () => {
  it('supplies a cell for every declared column', () => {
    for (const row of toWaterGroups(rows, CYCLE)[0]!.rows) {
      for (const column of WATER_COLUMNS) {
        expect(row.cells[column.key], `${row.id} is missing "${column.key}"`).toBeDefined();
      }
    }
  });

  it('says why each figure is what it is, not just what it is', () => {
    const group = toWaterGroups(rows, CYCLE)[0]!;
    const byId = new Map(group.rows.map((r) => [r.id, r]));

    expect(byId.get('l-101')!.cells.basis).toMatchObject({ value: 'เหมา 100/คน' });
    expect(byId.get('l-laundry')!.cells.basis).toMatchObject({ value: 'มิเตอร์น้ำ 45 หน่วย' });
  });

  it('offers a count field on a room, and none on the meter', () => {
    const byId = new Map(toWaterGroups(rows, CYCLE)[0]!.rows.map((r) => [r.id, r]));

    expect(byId.get('l-101')!.cells.occupants!.kind).toBe('input');
    expect((byId.get('l-101')!.cells.occupants as LedgerInputCell).value).toBe('2');
    // An editable zero here would invite someone to "fix" it.
    expect(byId.get('l-laundry')!.cells.occupants).toMatchObject({ kind: 'text', value: '—' });
  });

  it('puts back what was typed when a submission comes back with errors', () => {
    const submitted = form({ [occupantFieldName(rowFor('101'))]: '4' });
    const byId = new Map(toWaterGroups(rows, CYCLE, submitted)[0]!.rows.map((r) => [r.id, r]));

    expect((byId.get('l-101')!.cells.occupants as LedgerInputCell).value).toBe('4');
  });
});

describe('occupantUpdatesFromForm', () => {
  it('writes only the count that changed', () => {
    const result = occupantUpdatesFromForm(
      rows,
      form({
        [occupantFieldName(rowFor('101'))]: '3',
        [occupantFieldName(rowFor('102'))]: '1',
      }),
    );

    expect(result.errors).toEqual([]);
    expect(result.updates).toEqual([{ leaseId: 'l-101', occupantCount: 3 }]);
  });

  it('writes nothing when nothing moved', () => {
    const result = occupantUpdatesFromForm(
      rows,
      form({
        [occupantFieldName(rowFor('101'))]: '2',
        [occupantFieldName(rowFor('102'))]: '1',
      }),
    );

    expect(result.updates).toEqual([]);
  });

  /**
   * The silent failure the source spreadsheet warns about in its own
   * instructions. The field arrives pre-filled, so an empty one means it was
   * cleared — treating that as no-change would bill the room at a stale
   * figure without saying so.
   */
  it('refuses a cleared count rather than leaving the old one in place', () => {
    const result = occupantUpdatesFromForm(rows, form({ [occupantFieldName(rowFor('101'))]: '' }));

    expect(result.updates).toEqual([]);
    expect(result.errors[0]).toContain('101');
    expect(result.errors[0]).toContain('ค่าน้ำผิด');
  });

  it('refuses half a person, and a negative one', () => {
    expect(
      occupantUpdatesFromForm(rows, form({ [occupantFieldName(rowFor('101'))]: '1.5' })).errors,
    ).toHaveLength(1);
    expect(
      occupantUpdatesFromForm(rows, form({ [occupantFieldName(rowFor('101'))]: '-1' })).errors,
    ).toHaveLength(1);
  });

  it('accepts zero, which is a real answer for a shop', () => {
    const result = occupantUpdatesFromForm(rows, form({ [occupantFieldName(rowFor('101'))]: '0' }));

    expect(result.errors).toEqual([]);
    expect(result.updates).toEqual([{ leaseId: 'l-101', occupantCount: 0 }]);
  });

  it('never asks the metered row for a headcount', () => {
    const result = occupantUpdatesFromForm(rows, form({ 'occupants:l-laundry': '' }));

    expect(result.errors).toEqual([]);
    expect(result.updates).toEqual([]);
  });
});
