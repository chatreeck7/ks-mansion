import type { Room, SpaceKind } from '@/lib/models/room';
import type { RoomRepository } from '../room-repository';
import type { SheetsClient } from './sheets-client';

const TAB_NAME = 'rooms';

/** Columns every row must resolve to build a Room. `detail` is optional. */
const REQUIRED_COLUMNS = ['id', 'room_number', 'kind', 'price', 'floor', 'hasMeter'] as const;

export class SheetRowError extends Error {
  constructor(rowNumber: number, reason: string) {
    super(`Sheets tab "${TAB_NAME}", row ${rowNumber}: ${reason}`);
    this.name = 'SheetRowError';
  }
}

/** Throws on a duplicate column name — a silent index collision is exactly the kind of corruption this module exists to catch. */
function indexHeader(header: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  header.forEach((name, i) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed in index) {
      throw new Error(`Sheets tab "${TAB_NAME}" has a duplicate column header "${trimmed}"`);
    }
    index[trimmed] = i;
  });
  return index;
}

/** A row with content only in non-required columns (an admin's note, a section divider) is not data. */
function isBlankRow(row: string[], columnIndex: Record<string, number>): boolean {
  return REQUIRED_COLUMNS.every((column) => (row[columnIndex[column]] ?? '').trim() === '');
}

function parseNumber(raw: string, rowNumber: number, column: string): number {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) {
    throw new SheetRowError(rowNumber, `"${column}" is not a number: "${raw}"`);
  }
  return value;
}

function parseNullableNumber(raw: string, rowNumber: number, column: string): number | null {
  if (raw === '') return null;
  return parseNumber(raw, rowNumber, column);
}

function parseKind(raw: string, rowNumber: number): SpaceKind {
  if (raw === 'unit' || raw === 'common') return raw;
  throw new SheetRowError(rowNumber, `"kind" must be "unit" or "common", got "${raw}"`);
}

function parseBoolean(raw: string, rowNumber: number, column: string): boolean {
  const normalized = raw.toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new SheetRowError(rowNumber, `"${column}" must be "true" or "false", got "${raw}"`);
}

/**
 * Parses one data row into a Room, per the target header contract in
 * docs/sheet-schema.md. Fails loud on the exact corruption that motivated
 * that doc — a row with a non-numeric value in a numeric column, an
 * unrecognized value in an enum-like column, or a missing required cell —
 * rather than silently misreading it.
 */
function parseRoom(row: string[], columnIndex: Record<string, number>, rowNumber: number): Room {
  const cell = (name: string) => (row[columnIndex[name]] ?? '').trim();

  const id = cell('id');
  if (!id) throw new SheetRowError(rowNumber, 'missing "id"');

  const roomNumber = cell('room_number');
  if (!roomNumber) throw new SheetRowError(rowNumber, 'missing "room_number"');

  const kind = parseKind(cell('kind'), rowNumber);
  const rentRate = parseNullableNumber(cell('price'), rowNumber, 'price');

  const floor = parseNumber(cell('floor'), rowNumber, 'floor');
  if (!Number.isInteger(floor) || floor < 0 || floor > 3) {
    throw new SheetRowError(rowNumber, `"floor" must be an integer from 0 to 3, got "${cell('floor')}"`);
  }

  const hasMeter = parseBoolean(cell('hasMeter'), rowNumber, 'hasMeter');

  const detail = cell('detail');
  const label = detail || roomNumber;

  return { id, label, floor, kind, rentRate, hasMeter };
}

interface Tab {
  columnIndex: Record<string, number>;
  dataRows: string[][];
}

async function readTab(client: SheetsClient): Promise<Tab> {
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

  return { columnIndex, dataRows };
}

/**
 * Reads the "rooms" tab per docs/sheet-schema.md: header row resolved by
 * name (never position), a stable id column separate from room_number,
 * validated on read. Not yet wired into the composition root — see
 * src/lib/repositories/index.ts.
 *
 * `getRoom` deliberately does not go through `listRooms` — it parses only
 * the one row it needs, so a lookup for a valid room never fails because of
 * an unrelated malformed row elsewhere in the tab. That also means it skips
 * `listRooms`'s whole-tab duplicate-id check; duplicate ids are a
 * tab-integrity concern `listRooms` is responsible for surfacing, not a
 * per-lookup one.
 */
export function createSheetsRoomRepository(client: SheetsClient): RoomRepository {
  return {
    async listRooms(): Promise<Room[]> {
      const { columnIndex, dataRows } = await readTab(client);

      const rooms: Room[] = [];
      const rowNumberById = new Map<string, number>();
      dataRows.forEach((row, i) => {
        const rowNumber = i + 2; // +2: 1-indexed, plus the header row
        if (isBlankRow(row, columnIndex)) return;

        const room = parseRoom(row, columnIndex, rowNumber);
        const previousRow = rowNumberById.get(room.id);
        if (previousRow !== undefined) {
          throw new SheetRowError(rowNumber, `duplicate id "${room.id}", already used on row ${previousRow}`);
        }
        rowNumberById.set(room.id, rowNumber);
        rooms.push(room);
      });

      return rooms;
    },

    async getRoom(id: string): Promise<Room | null> {
      const { columnIndex, dataRows } = await readTab(client);

      const match = dataRows
        .map((row, i) => ({ row, rowNumber: i + 2 }))
        .find(({ row }) => !isBlankRow(row, columnIndex) && (row[columnIndex['id']!] ?? '').trim() === id);

      return match ? parseRoom(match.row, columnIndex, match.rowNumber) : null;
    },
  };
}
