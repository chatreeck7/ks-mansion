import { describe, expect, it } from 'vitest';
import { createSheetsRoomRepository } from './sheets-room-repository';
import type { SheetsClient } from './sheets-client';

const HEADER = ['id', 'room_number', 'kind', 'status', 'price', 'detail', 'type', 'floor', 'hasMeter'] as const;

function fakeClient(rows: string[][]): SheetsClient {
  return {
    async getTabValues() {
      return [[...HEADER], ...rows];
    },
  };
}

function unitRow(overrides: Partial<Record<(typeof HEADER)[number], string>> = {}): string[] {
  const defaults: Record<(typeof HEADER)[number], string> = {
    id: '101',
    room_number: '101',
    kind: 'unit',
    status: 'occupied',
    price: '2636',
    detail: '',
    type: 'AC',
    floor: '1',
    hasMeter: 'TRUE',
  };
  const merged = { ...defaults, ...overrides };
  return HEADER.map((column) => merged[column]);
}

describe('createSheetsRoomRepository', () => {
  it('parses a well-formed row into a Room', async () => {
    const repo = createSheetsRoomRepository(fakeClient([unitRow()]));
    const rooms = await repo.listRooms();
    expect(rooms).toEqual([
      { id: '101', label: '101', floor: 1, kind: 'unit', rentRate: 2636, hasMeter: true },
    ]);
  });

  it('reads columns by header name, not position', async () => {
    const shuffledHeader = ['hasMeter', 'floor', 'price', 'kind', 'room_number', 'id'];
    const client: SheetsClient = {
      async getTabValues() {
        return [shuffledHeader, ['TRUE', '2', '2724', 'unit', '201', '201']];
      },
    };
    const rooms = await createSheetsRoomRepository(client).listRooms();
    expect(rooms).toEqual([
      { id: '201', label: '201', floor: 2, kind: 'unit', rentRate: 2724, hasMeter: true },
    ]);
  });

  it('leaves rentRate null when price is genuinely blank, not a guessed number', async () => {
    const repo = createSheetsRoomRepository(fakeClient([unitRow({ id: '206', room_number: '206', price: '' })]));
    expect((await repo.listRooms())[0]?.rentRate).toBeNull();
  });

  it('accepts hasMeter case-insensitively', async () => {
    const repo = createSheetsRoomRepository(fakeClient([unitRow({ hasMeter: 'false' })]));
    expect((await repo.listRooms())[0]?.hasMeter).toBe(false);
  });

  it('labels a common space from "detail" when room_number is a slug, not a display name', async () => {
    const repo = createSheetsRoomRepository(
      fakeClient([
        unitRow({
          id: 'laundry',
          room_number: 'laundry',
          kind: 'common',
          price: '3192',
          detail: 'ร้านซักผ้า',
          floor: '1',
        }),
      ]),
    );
    const [room] = await repo.listRooms();
    expect(room).toMatchObject({ id: 'laundry', label: 'ร้านซักผ้า', kind: 'common' });
  });

  it('skips a fully blank trailing row', async () => {
    const repo = createSheetsRoomRepository(fakeClient([unitRow(), ['', '', '', '', '', '', '', '', '']]));
    expect(await repo.listRooms()).toHaveLength(1);
  });

  it('skips a row with only a note in a non-required column, not just fully blank rows', async () => {
    // An admin's section-divider row: every required column blank, a note
    // sitting in "detail" — must not be mistaken for a corrupt data row.
    const noteRow = ['', '', '', '', '', '-- vacant units below --', '', '', ''];
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
      fakeClient([unitRow({ id: '101', room_number: '101' }), unitRow({ id: '206', room_number: '206', price: 'AC' })]),
    );
    expect((await repo.getRoom('101'))?.label).toBe('101');
  });

  describe('validation — catching the corruption KS-53 documented', () => {
    it('throws when the header is missing a required column', async () => {
      const client: SheetsClient = {
        async getTabValues() {
          return [['room_number', 'kind'], ['101', 'unit']];
        },
      };
      await expect(createSheetsRoomRepository(client).listRooms()).rejects.toThrow(/missing required column "id"/);
    });

    it('throws when the header has a duplicate column name', async () => {
      const client: SheetsClient = {
        async getTabValues() {
          return [
            ['id', 'room_number', 'kind', 'price', 'floor', 'hasMeter', 'price'],
            ['101', '101', 'unit', '2636', '1', 'true', '9999'],
          ];
        },
      };
      await expect(createSheetsRoomRepository(client).listRooms()).rejects.toThrow(
        /duplicate column header "price"/,
      );
    });

    it('throws instead of silently reading a shifted non-numeric value as price', async () => {
      // The exact failure KS_Mansion_DB showed live: a column shifted left,
      // landing a type value ("AC") where a numeric column was expected.
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ price: 'AC' })]));
      await expect(repo.listRooms()).rejects.toThrow(/"price" is not a number: "AC"/);
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

    it('throws when kind is neither unit nor common', async () => {
      const repo = createSheetsRoomRepository(fakeClient([unitRow({ kind: 'maybe' })]));
      await expect(repo.listRooms()).rejects.toThrow(/"kind" must be "unit" or "common"/);
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
