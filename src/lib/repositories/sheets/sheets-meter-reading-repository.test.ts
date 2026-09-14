import { describe, expect, it } from 'vitest';
import { createInMemorySheets } from '../memory/in-memory-sheets';
import { createSheetsMeterReadingRepository } from './sheets-meter-reading-repository';

const HEADER = [
  'id', 'room_id', 'meter_type', 'read_date', 'previous_reading',
  'current_reading', 'rate_per_unit', 'note', 'archived',
];

function client(rows: string[][]) {
  return createInMemorySheets({ meter_readings: [HEADER, ...rows] });
}

function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const defaults: Record<string, string> = {
    id: 'm-001',
    room_id: '101',
    meter_type: 'electricity',
    read_date: '26 มี.ค. 2568',
    previous_reading: '1200',
    current_reading: '1256',
    rate_per_unit: '6',
    note: '',
    archived: 'FALSE',
  };
  const merged: Record<string, string | undefined> = { ...defaults, ...overrides };
  return HEADER.map((c) => merged[c] ?? '');
}

function repo(rows: string[][]) {
  return createSheetsMeterReadingRepository(client(rows));
}

describe('createSheetsMeterReadingRepository', () => {
  it('parses a well-formed row, Thai date included', async () => {
    const [reading] = await repo([row()]).listReadings();

    expect(reading).toEqual({
      id: 'm-001',
      roomId: '101',
      meterType: 'electricity',
      readDate: new Date(2025, 2, 26),
      previousReading: 1200,
      currentReading: 1256,
      ratePerUnit: 6,
      note: null,
      archived: false,
    });
  });

  it('tolerates the thousands separators Sheets itself inserts', async () => {
    const [reading] = await repo([
      row({ previous_reading: '4,215', current_reading: '4,343' }),
    ]).listReadings();

    expect(reading).toMatchObject({ previousReading: 4215, currentReading: 4343 });
  });

  it('reads both of the laundry meters as separate records', async () => {
    const readings = await repo([
      row({ id: 'm-001', room_id: 'laundry', meter_type: 'electricity',
            previous_reading: '4215', current_reading: '4343', rate_per_unit: '5' }),
      row({ id: 'm-002', room_id: 'laundry', meter_type: 'water',
            previous_reading: '786', current_reading: '816', rate_per_unit: '15' }),
    ]).listReadingsForRoom('laundry');

    expect(readings.map((r) => r.meterType)).toEqual(['electricity', 'water']);
    expect(readings.map((r) => r.ratePerUnit)).toEqual([5, 15]);
  });

  it('rejects a meter type it does not know', async () => {
    await expect(repo([row({ meter_type: 'gas' })]).listReadings()).rejects.toThrow(/meter_type/);
  });

  it('rejects a Gregorian read date rather than reinterpreting it', async () => {
    // 2026 as a พ.ศ. year would silently mean 1483 CE. Loud is the point.
    await expect(repo([row({ read_date: '26/3/2026' })]).listReadings()).rejects.toThrow(
      /read_date/,
    );
  });

  /**
   * The asymmetry that decides this: refusing a genuine case asks an admin to
   * look at one row, while accepting a transposed digit quietly *credits* a
   * tenant on a bill nobody re-checks.
   */
  it('refuses a current reading below its previous one', async () => {
    await expect(
      repo([row({ previous_reading: '1256', current_reading: '1200' })]).listReadings(),
    ).rejects.toThrow(/does not run backwards/);
  });

  it('accepts a meter that did not move', async () => {
    const [reading] = await repo([
      row({ previous_reading: '1256', current_reading: '1256' }),
    ]).listReadings();

    expect(reading).toMatchObject({ previousReading: 1256, currentReading: 1256 });
  });

  it('rejects a negative rate', async () => {
    await expect(repo([row({ rate_per_unit: '-6' })]).listReadings()).rejects.toThrow(
      /rate_per_unit/,
    );
  });

  it('names the missing column rather than failing vaguely', async () => {
    const sheets = createInMemorySheets({
      meter_readings: [HEADER.filter((c) => c !== 'rate_per_unit'), []],
    });

    await expect(createSheetsMeterReadingRepository(sheets).listReadings()).rejects.toThrow(
      /missing required column "rate_per_unit"/,
    );
  });
});

describe('recording a reading', () => {
  it('appends rather than editing, and hands out the next id', async () => {
    const sheets = client([row()]);
    const readings = createSheetsMeterReadingRepository(sheets);

    const recorded = await readings.recordReading({
      roomId: '101',
      meterType: 'electricity',
      readDate: new Date(2025, 3, 26),
      previousReading: 1256,
      currentReading: 1312,
      ratePerUnit: 6,
      note: null,
    });

    expect(recorded.id).toBe('m-002');
    expect(sheets.rowsOf('meter_readings')).toHaveLength(3);
    // The reading it continues from is untouched — this is history.
    expect(await readings.getReading('m-001')).toMatchObject({ currentReading: 1256 });
  });

  it('writes the read date back in พ.ศ., so it reads back unchanged', async () => {
    const sheets = client([]);
    const readings = createSheetsMeterReadingRepository(sheets);

    await readings.recordReading({
      roomId: '101',
      meterType: 'electricity',
      readDate: new Date(2025, 2, 26),
      previousReading: 1200,
      currentReading: 1256,
      ratePerUnit: 6,
      note: null,
    });

    expect(sheets.rowsOf('meter_readings')[1]).toContain('26 มี.ค. 2568');
    expect((await readings.getReading('m-001'))?.readDate).toEqual(new Date(2025, 2, 26));
  });

  it('refuses to write a reading that could not be read back, and writes nothing', async () => {
    const sheets = client([row()]);
    const readings = createSheetsMeterReadingRepository(sheets);
    const before = sheets.writeCount();

    await expect(
      readings.recordReading({
        roomId: '101',
        meterType: 'electricity',
        readDate: new Date(2025, 3, 26),
        previousReading: 1312,
        currentReading: 1256,
        ratePerUnit: 6,
        note: null,
      }),
    ).rejects.toThrow(/does not run backwards/);

    expect(sheets.writeCount()).toBe(before);
    expect(sheets.rowsOf('meter_readings')).toHaveLength(2);
  });

  /** Rule 7: the row stays, the flag goes on, the id stays spent. */
  it('hides an archived reading from the list but keeps it reachable by id', async () => {
    const readings = repo([row(), row({ id: 'm-002', note: 'ผิดห้อง' })]);

    await readings.archiveReading('m-002');

    expect((await readings.listReadings()).map((r) => r.id)).toEqual(['m-001']);
    expect(await readings.getReading('m-002')).toMatchObject({ id: 'm-002', archived: true });
  });
});

describe('latestReading', () => {
  it('is null the first time a meter is read', async () => {
    expect(await repo([]).latestReading('101', 'electricity')).toBeNull();
  });

  it('picks the most recent read for that exact meter', async () => {
    const readings = repo([
      row({ id: 'm-001', read_date: '26 ก.พ. 2568', current_reading: '1256' }),
      row({ id: 'm-002', read_date: '26 มี.ค. 2568', previous_reading: '1256',
            current_reading: '1312' }),
    ]);

    expect(await readings.latestReading('101', 'electricity')).toMatchObject({
      id: 'm-002',
      currentReading: 1312,
    });
  });

  it('is not confused by sheet order', async () => {
    const readings = repo([
      row({ id: 'm-002', read_date: '26 มี.ค. 2568', previous_reading: '1256',
            current_reading: '1312' }),
      row({ id: 'm-001', read_date: '26 ก.พ. 2568', current_reading: '1256' }),
    ]);

    expect((await readings.latestReading('101', 'electricity'))?.id).toBe('m-002');
  });

  /**
   * What a เก็บตก correction actually looks like: the same meter re-read the
   * same evening. The later row is the one that supersedes.
   */
  it('takes the later row when two readings share a date', async () => {
    const readings = repo([
      row({ id: 'm-007', current_reading: '1500' }),
      row({ id: 'm-008', current_reading: '1590', note: 'เก็บตก — เลขเดิมจดผิด' }),
    ]);

    expect(await readings.latestReading('101', 'electricity')).toMatchObject({
      id: 'm-008',
      currentReading: 1590,
    });
  });

  it('keeps the laundry two meters apart', async () => {
    const readings = repo([
      row({ id: 'm-001', room_id: 'laundry', meter_type: 'electricity',
            previous_reading: '4215', current_reading: '4343', rate_per_unit: '5' }),
      row({ id: 'm-002', room_id: 'laundry', meter_type: 'water',
            previous_reading: '786', current_reading: '816', rate_per_unit: '15' }),
    ]);

    expect(await readings.latestReading('laundry', 'water')).toMatchObject({
      id: 'm-002',
      currentReading: 816,
    });
  });

  it('ignores an archived reading, so a withdrawn row cannot become the baseline', async () => {
    const readings = repo([
      row({ id: 'm-001', read_date: '26 ก.พ. 2568', current_reading: '1256' }),
      row({ id: 'm-002', read_date: '26 มี.ค. 2568', previous_reading: '1256',
            current_reading: '9999', archived: 'TRUE' }),
    ]);

    expect((await readings.latestReading('101', 'electricity'))?.id).toBe('m-001');
  });
});
