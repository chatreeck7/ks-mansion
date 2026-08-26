import { describe, expect, it } from 'vitest';
import { createInMemorySheets } from '../memory/in-memory-sheets';
import { createSheetsRoomRepository } from './sheets-room-repository';

const HEADER = [
  'id', 'room_number', 'kind', 'status', 'rent_rate', 'detail', 'type', 'floor', 'hasMeter',
  'has_tv', 'has_fridge', 'has_aircon', 'archived',
] as const;

const BLANK_ROW = HEADER.map(() => '');

function fakeClient(rows: string[][]) {
  return createInMemorySheets({ rooms: [[...HEADER], ...rows] });
}

function unitRow(overrides: Partial<Record<(typeof HEADER)[number], string>> = {}): string[] {
  const defaults: Record<(typeof HEADER)[number], string> = {
    id: '101',
    room_number: '101',
    kind: 'unit',
    status: 'occupied',
    rent_rate: '2200',
    detail: '',
    type: 'AC',
    floor: '1',
    hasMeter: 'TRUE',
    has_tv: 'FALSE',
    has_fridge: 'FALSE',
    has_aircon: 'TRUE',
    archived: 'FALSE',
  };
  const merged = { ...defaults, ...overrides };
  return HEADER.map((column) => merged[column]);
}

const ROOM_101 = {
  archived: false,
  id: '101',
  label: '101',
  floor: 1,
  kind: 'unit',
  status: 'occupied',
  rentRate: 2200,
  hasMeter: true,
  appliances: { tv: false, fridge: false, aircon: true },
};

describe('createSheetsRoomRepository', () => {
  it('parses a well-formed row into a Room', async () => {
    const repo = createSheetsRoomRepository(fakeClient([unitRow()]));
    expect(await repo.listRooms()).toEqual([ROOM_101]);
  });

  it('reads columns by header name, not position', async () => {
    const shuffledHeader = [
      'has_aircon', 'hasMeter', 'floor', 'rent_rate', 'status', 'kind', 'room_number', 'id',
      'has_tv', 'has_fridge', 'archived', 'detail',
    ];
    const client = createInMemorySheets({ rooms: [
          shuffledHeader,
          ['TRUE', 'TRUE', '2', '2300', 'occupied', 'unit', '201', '201', 'FALSE', 'FALSE', 'FALSE', ''],
        ] });
    expect(await createSheetsRoomRepository(client).listRooms()).toEqual([
      { ...ROOM_101, id: '201', label: '201', floor: 2, rentRate: 2300 },
    ]);
  });

  // Sheets returns the *formatted* value, so a number-formatted rent_rate
  // column arrives as "2,200". Read with a bare Number() every one of those
  // becomes NaN and the whole tab fails — which is what a comma in the live
  // sheet actually did.
  it('reads a thousands-separated rent, as the sheet formats it', async () => {
    const repo = createSheetsRoomRepository(fakeClient([unitRow({ rent_rate: '2,200' })]));
    expect((await repo.listRooms())[0]?.rentRate).toBe(2200);
  });

  it('leaves rentRate null when rent_rate is genuinely blank, not a guessed number', async () => {
    const repo = createSheetsRoomRepository(
      fakeClient([unitRow({ id: '206', room_number: '206', rent_rate: '' })]),
    );
    expect((await repo.listRooms())[0]?.rentRate).toBeNull();
  });

  /**
   * Nothing records TV or fridge yet. Reading a blank as `false` would put
   * "this room has no fridge" on a report nobody has surveyed for — so the
   * third state exists, and the migration does not require inventing 54
   * cells of data before the tab can be read at all.
   */
  it('reads a blank appliance cell as "not on file", distinct from "no"', async () => {
    const repo = createSheetsRoomRepository(
      fakeClient([unitRow({ has_tv: '', has_fridge: 'FALSE' })]),
    );
    const [room] = await repo.listRooms();
    expect(room?.appliances.tv).toBeNull();
    expect(room?.appliances.fridge).toBe(false);
  });

  // hasMeter keeps rejecting a blank: an unrecorded meter drops a room out of
  // the meter round, where an unrecorded fridge costs nothing yet.
  it('still rejects a blank hasMeter, which is not the same kind of unknown', async () => {
    const repo = createSheetsRoomRepository(fakeClient([unitRow({ hasMeter: '' })]));
    await expect(repo.listRooms()).rejects.toThrow(/"hasMeter" must be "true" or "false", got ""/);
  });

  it('accepts booleans case-insensitively', async () => {
    const repo = createSheetsRoomRepository(
      fakeClient([unitRow({ hasMeter: 'false', has_tv: 'true' })]),
    );
    const [room] = await repo.listRooms();
    expect(room?.hasMeter).toBe(false);
    expect(room?.appliances.tv).toBe(true);
  });

  it('reads every status the monthly report tracks, including แจ้งออก', async () => {
    const repo = createSheetsRoomRepository(
      fakeClient([
        unitRow({ id: '101', status: 'occupied' }),
        unitRow({ id: '102', status: 'noticeGiven' }),
        unitRow({ id: '103', status: 'available' }),
        unitRow({ id: '104', status: 'maintenance' }),
      ]),
    );
    expect((await repo.listRooms()).map((r) => r.status)).toEqual([
      'occupied',
      'noticeGiven',
      'available',
      'maintenance',
    ]);
  });

  it('labels a common space from "detail" when room_number is a slug, not a display name', async () => {
    const repo = createSheetsRoomRepository(
      fakeClient([
        unitRow({
          id: 'laundry',
          room_number: 'laundry',
          kind: 'common',
          rent_rate: '1800',
          detail: 'ร้านซักผ้า',
          floor: '1',
          has_aircon: 'FALSE',
        }),
      ]),
    );
    const [room] = await repo.listRooms();
    expect(room).toMatchObject({ id: 'laundry', label: 'ร้านซักผ้า', kind: 'common' });
  });

  it('skips a fully blank trailing row', async () => {
    const repo = createSheetsRoomRepository(fakeClient([unitRow(), BLANK_ROW]));
    expect(await repo.listRooms()).toHaveLength(1);
  });

  it('skips a row with only a note in a non-required column, not just fully blank rows', async () => {
    // An admin's section-divider row: every contracted column blank, a note
    // sitting in "detail" — must not be mistaken for a corrupt data row.
    const noteRow = [...BLANK_ROW];
    noteRow[HEADER.indexOf('detail')] = '-- vacant units below --';
    const repo = createSheetsRoomRepository(fakeClient([unitRow(), noteRow]));
    expect(await repo.listRooms()).toHaveLength(1);
  });

  it('finds a room by id', async () => {
    const repo = createSheetsRoomRepository(fakeClient([unitRow({ id: '203', room_number: '203' })]));
    expect((await repo.getRoom('203'))?.label).toBe('203');
  });

  it('returns null for an unknown id', async () => {
    const repo = createSheetsRoomRepository(fakeClient([unitRow()]));
    expect(await repo.getRoom('999')).toBeNull();
  });

  it('finds a valid room by id even when an unrelated row elsewhere is corrupted', async () => {
    const repo = createSheetsRoomRepository(
      fakeClient([
        unitRow({ id: '101', room_number: '101' }),
        unitRow({ id: '206', room_number: '206', rent_rate: 'AC' }),
      ]),
    );
    expect((await repo.getRoom('101'))?.label).toBe('101');
  });

  describe('validation — catching the corruption KS-53 documented', () => {
    /**
     * Every missing name at once, not just the first. Reporting one at a time
     * turns a short header into one fix-and-recheck round per column, and
     * each round is a person going back to a spreadsheet.
     */
    it('names every missing column, not only the first', async () => {
      const client = createInMemorySheets({ rooms: [['room_number', 'kind'], ['101', 'unit']] });

      await expect(createSheetsRoomRepository(client).listRooms()).rejects.toThrow(
        /missing required columns .*"id".*"archived"/,
      );
    });

    it('throws when the header has a duplicate column name', async () => {
      const client = createInMemorySheets({
        rooms: [
          [...HEADER, 'rent_rate'],
          [...unitRow(), '9999'],
        ],
      });
      await expect(createSheetsRoomRepository(client).listRooms()).rejects.toThrow(
        /duplicate column header "rent_rate"/,
      );
    });

    it('throws instead of silently reading a shifted non-numeric value as rent', async () => {
      // The exact failure KS-53 documents: a column shifted left, landing a
      // type value ("AC") where a numeric column was expected.
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ rent_rate: 'AC' })]));
      await expect(repo.listRooms()).rejects.toThrow(/"rent_rate" is not a number: "AC"/);
    });

    it('throws when floor is missing', async () => {
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ floor: '' })]));
      await expect(repo.listRooms()).rejects.toThrow(/"floor" is not a number/);
    });

    it('throws when floor is outside the model\'s 0-3 range', async () => {
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ floor: '-1' })]));
      await expect(repo.listRooms()).rejects.toThrow(/"floor" must be an integer from 0 to 3/);
    });

    it('throws when floor is not an integer', async () => {
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ floor: '1.5' })]));
      await expect(repo.listRooms()).rejects.toThrow(/"floor" must be an integer from 0 to 3/);
    });

    it('throws instead of silently defaulting hasMeter to false on a corrupted value', async () => {
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ hasMeter: 'AC' })]));
      await expect(repo.listRooms()).rejects.toThrow(/"hasMeter" must be "true" or "false", got "AC"/);
    });

    it('still rejects a corrupted appliance value, even though blank is allowed', async () => {
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ has_fridge: 'AC' })]));
      await expect(repo.listRooms()).rejects.toThrow(/"has_fridge" must be "true" or "false", got "AC"/);
    });

    it('throws when kind is neither unit nor common', async () => {
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ kind: 'maybe' })]));
      await expect(repo.listRooms()).rejects.toThrow(/"kind" must be one of "unit", "common", got "maybe"/);
    });

    it('throws on an unrecognised status rather than guessing occupancy', async () => {
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ status: 'ว่าง' })]));
      await expect(repo.listRooms()).rejects.toThrow(/"status" must be one of .*got "ว่าง"/);
    });

    it('throws when id is blank', async () => {
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ id: '' })]));
      await expect(repo.listRooms()).rejects.toThrow(/missing "id"/);
    });

    it('throws on a duplicate id and names both rows — the exact shape of the paste-duplication incident', async () => {
      const repo = createSheetsRoomRepository(
        fakeClient([unitRow({ id: '101' }), unitRow({ id: '101', room_number: '102' })]),
      );
      await expect(repo.listRooms()).rejects.toThrow(/row 3: duplicate id "101", already used on row 2/);
    });
  });
});
