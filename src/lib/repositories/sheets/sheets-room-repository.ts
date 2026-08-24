import type { Room, SpaceKind } from '@/lib/models/room';
import type { RoomRepository } from '../room-repository';
import type { SheetsClient } from './sheets-client';

const TAB_NAME = 'rooms';

/** Columns every row must resolve to build a Room. `detail` is optional. */
const REQUIRED_COLUMNS = ['id', 'room_number', 'kind', 'price', 'floor', 'hasMeter'] as const;

export class SheetRowError extends Error {
  constructor(tabName: string, rowNumber: number, reason: string) {
    super(`Sheets tab "${tabName}", row ${rowNumber}: ${reason}`);
    this.name = 'SheetRowError';
  }
}

function indexHeader(header: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  header.forEach((name, i) => {
    const trimmed = name.trim();
    if (trimmed) index[trimmed] = i;
  });
  return index;
}

function parseNullableNumber(raw: string): number | null | typeof NOT_A_NUMBER {
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NOT_A_NUMBER;
}
const NOT_A_NUMBER = Symbol('not-a-number');

function parseKind(raw: string, tabName: string, rowNumber: number): SpaceKind {
  if (raw === 'unit' || raw === 'common') return raw;
  throw new SheetRowError(tabName, rowNumber, `"kind" must be "unit" or "common", got "${raw}"`);
}

function parseBoolean(raw: string): boolean {
  return raw.trim().toLowerCase() === 'true';
}

/**
 * Parses one data row into a Room, per the target header contract in
 * docs/sheet-schema.md. Fails loud on the exact corruption that motivated
 * that doc — a row with a non-numeric value in a numeric column, or a
 * missing required cell — rather than silently misreading it.
 */
function parseRoom(row: string[], columnIndex: Record<string, number>, rowNumber: number): Room {
  const cell = (name: string) => (row[columnIndex[name]] ?? '').trim();

  const id = cell('id');
  if (!id) throw new SheetRowError(TAB_NAME, rowNumber, 'missing "id"');

  const roomNumber = cell('room_number');
  if (!roomNumber) throw new SheetRowError(TAB_NAME, rowNumber, 'missing "room_number"');

  const kind = parseKind(cell('kind'), TAB_NAME, rowNumber);

  const rentRate = parseNullableNumber(cell('price'));
  if (rentRate === NOT_A_NUMBER) {
    throw new SheetRowError(TAB_NAME, rowNumber, `"price" is not a number: "${cell('price')}"`);
  }

  const floorRaw = cell('floor');
  const floor = Number(floorRaw);
  if (floorRaw === '' || !Number.isFinite(floor)) {
    throw new SheetRowError(TAB_NAME, rowNumber, `"floor" is not a number: "${floorRaw}"`);
  }

  const hasMeter = parseBoolean(cell('hasMeter'));

  const detail = cell('detail');
  const label = detail || roomNumber;

  return { id, label, floor, kind, rentRate, hasMeter };
}

function assertNoDuplicateIds(rooms: Room[]): void {
  const seen = new Set<string>();
  for (const room of rooms) {
    if (seen.has(room.id)) {
      throw new Error(`Sheets tab "${TAB_NAME}" has duplicate id "${room.id}"`);
    }
    seen.add(room.id);
  }
}

/**
 * Reads the "rooms" tab per docs/sheet-schema.md: header row resolved by
 * name (never position), a stable id column separate from room_number,
 * validated on read. Not yet wired into the composition root — see
 * src/lib/repositories/index.ts.
 */
export function createSheetsRoomRepository(client: SheetsClient): RoomRepository {
  async function listRooms(): Promise<Room[]> {
    const rows = await client.getTabValues(TAB_NAME);
    if (rows.length === 0) {
      throw new Error(`Sheets tab "${TAB_NAME}" has no header row`);
    }

    const [header, ...dataRows] = rows;
    const columnIndex = indexHeader(header!);
    for (const column of REQUIRED_COLUMNS) {
      if (!(column in columnIndex)) {
        throw new Error(`Sheets tab "${TAB_NAME}" is missing required column "${column}"`);
      }
    }

    const rooms = dataRows
      .map((row, i) => ({ row, rowNumber: i + 2 })) // +2: 1-indexed, plus the header row
      .filter(({ row }) => row.some((cell) => cell.trim() !== ''))
      .map(({ row, rowNumber }) => parseRoom(row, columnIndex, rowNumber));

    assertNoDuplicateIds(rooms);
    return rooms;
  }

  return {
    listRooms,
    async getRoom(id: string) {
      const rooms = await listRooms();
      return rooms.find((room) => room.id === id) ?? null;
    },
  };
}
