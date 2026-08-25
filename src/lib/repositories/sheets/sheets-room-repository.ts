import type { Room, SpaceKind } from '@/lib/models/room';
import type { RoomRepository } from '../room-repository';
import type { SheetsClient } from './sheets-client';
import { cellValue, readTab, requireCell, SheetRowError, type Tab } from './tab-reader';

const TAB_NAME = 'rooms';

/** Columns every row must resolve to build a Room. `detail` is optional. */
const REQUIRED_COLUMNS = ['id', 'room_number', 'kind', 'price', 'floor', 'hasMeter'] as const;

const MIN_FLOOR = 0;
const MAX_FLOOR = 3;

function parseNumber(raw: string, rowNumber: number, column: string): number {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) {
    throw new SheetRowError(TAB_NAME, rowNumber, `"${column}" is not a number: "${raw}"`);
  }
  return value;
}

function parseNullableNumber(raw: string, rowNumber: number, column: string): number | null {
  if (raw === '') return null;
  return parseNumber(raw, rowNumber, column);
}

function parseKind(raw: string, rowNumber: number): SpaceKind {
  if (raw === 'unit' || raw === 'common') return raw;
  throw new SheetRowError(TAB_NAME, rowNumber, `"kind" must be "unit" or "common", got "${raw}"`);
}

function parseBoolean(raw: string, rowNumber: number, column: string): boolean {
  const normalized = raw.toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new SheetRowError(
    TAB_NAME,
    rowNumber,
    `"${column}" must be "true" or "false", got "${raw}"`,
  );
}

/**
 * Parses one data row into a Room, per the target header contract in
 * docs/sheet-schema.md. Fails loud on the exact corruption that motivated
 * that doc — a row with a non-numeric value in a numeric column, an
 * unrecognized value in an enum-like column, or a missing required cell —
 * rather than silently misreading it.
 */
function parseRoom(tab: Tab, row: string[], rowNumber: number): Room {
  const id = requireCell(tab, row, rowNumber, 'id');
  const roomNumber = requireCell(tab, row, rowNumber, 'room_number');

  const kind = parseKind(cellValue(tab, row, 'kind'), rowNumber);
  const rentRate = parseNullableNumber(cellValue(tab, row, 'price'), rowNumber, 'price');

  const floorRaw = cellValue(tab, row, 'floor');
  const floor = parseNumber(floorRaw, rowNumber, 'floor');
  if (!Number.isInteger(floor) || floor < MIN_FLOOR || floor > MAX_FLOOR) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"floor" must be an integer from ${MIN_FLOOR} to ${MAX_FLOOR}, got "${floorRaw}"`,
    );
  }

  const hasMeter = parseBoolean(cellValue(tab, row, 'hasMeter'), rowNumber, 'hasMeter');

  // The display name, where room_number is a slug ('laundry' → 'ร้านซักผ้า').
  const label = cellValue(tab, row, 'detail') || roomNumber;

  return { id, label, floor, kind, rentRate, hasMeter };
}

/**
 * Reads the "rooms" tab per docs/sheet-schema.md: header row resolved by
 * name (never position), a stable id column separate from room_number,
 * validated on read.
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
      const tab = await readTab(client, TAB_NAME, REQUIRED_COLUMNS);

      const rooms: Room[] = [];
      const rowNumberById = new Map<string, number>();
      tab.dataRows.forEach((row, i) => {
        const rowNumber = i + 2; // +2: 1-indexed, plus the header row
        if (tab.isBlankRow(row)) return;

        const room = parseRoom(tab, row, rowNumber);
        const previousRow = rowNumberById.get(room.id);
        if (previousRow !== undefined) {
          throw new SheetRowError(
            TAB_NAME,
            rowNumber,
            `duplicate id "${room.id}", already used on row ${previousRow}`,
          );
        }
        rowNumberById.set(room.id, rowNumber);
        rooms.push(room);
      });

      return rooms;
    },

    async getRoom(id: string): Promise<Room | null> {
      const tab = await readTab(client, TAB_NAME, REQUIRED_COLUMNS);

      const match = tab.dataRows
        .map((row, i) => ({ row, rowNumber: i + 2 }))
        .find(({ row }) => !tab.isBlankRow(row) && cellValue(tab, row, 'id') === id);

      return match ? parseRoom(tab, match.row, match.rowNumber) : null;
    },
  };
}
