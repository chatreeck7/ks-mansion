import type { Room, RoomStatus, SpaceKind } from '@/lib/models/room';
import type { RoomRepository } from '../room-repository';
import type { SheetsClient } from './sheets-client';
import {
  booleanCell,
  cellValue,
  enumCell,
  numberCell,
  optionalNumberCell,
  readTab,
  requireCell,
  SheetRowError,
  type Tab,
  type TabContract,
} from './tab-reader';

const TAB_NAME = 'rooms';

const KINDS: readonly SpaceKind[] = ['unit', 'common'];
const STATUSES: readonly RoomStatus[] = ['occupied', 'noticeGiven', 'available', 'maintenance'];

/**
 * `detail` is optional — a unit's `room_number` already is its label — so it
 * stays out of the contract entirely. Everything else must be present, and
 * every one of these carries a value on a real room, so the whole set defines
 * what a record is.
 */
const CONTRACT: TabContract = {
  columns: [
    'id',
    'room_number',
    'kind',
    'status',
    'rent_rate',
    'floor',
    'hasMeter',
    'has_tv',
    'has_fridge',
    'has_aircon',
  ],
};

const MIN_FLOOR = 0;
const MAX_FLOOR = 3;

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

  const kind = enumCell(tab, row, rowNumber, 'kind', KINDS);
  const status = enumCell(tab, row, rowNumber, 'status', STATUSES);

  // Rent, not a total bill — see the field's doc-comment in models/room.ts.
  const rentRate = optionalNumberCell(tab, row, rowNumber, 'rent_rate');

  const floor = numberCell(tab, row, rowNumber, 'floor');
  if (!Number.isInteger(floor) || floor < MIN_FLOOR || floor > MAX_FLOOR) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"floor" must be an integer from ${MIN_FLOOR} to ${MAX_FLOOR}, got "${cellValue(tab, row, 'floor')}"`,
    );
  }

  return {
    id,
    // The display name, where room_number is a slug ('laundry' → 'ร้านซักผ้า').
    label: cellValue(tab, row, 'detail') || roomNumber,
    floor,
    kind,
    status,
    rentRate,
    hasMeter: booleanCell(tab, row, rowNumber, 'hasMeter'),
    appliances: {
      tv: booleanCell(tab, row, rowNumber, 'has_tv'),
      fridge: booleanCell(tab, row, rowNumber, 'has_fridge'),
      aircon: booleanCell(tab, row, rowNumber, 'has_aircon'),
    },
  };
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
      const tab = await readTab(client, TAB_NAME, CONTRACT);

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
      const tab = await readTab(client, TAB_NAME, CONTRACT);

      const match = tab.dataRows
        .map((row, i) => ({ row, rowNumber: i + 2 }))
        .find(({ row }) => !tab.isBlankRow(row) && cellValue(tab, row, 'id') === id);

      return match ? parseRoom(tab, match.row, match.rowNumber) : null;
    },
  };
}
