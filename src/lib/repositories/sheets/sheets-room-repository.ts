import { ARCHIVED_COLUMN } from '@/lib/models/archivable';
import type { Room, RoomStatus, SpaceKind } from '@/lib/models/room';
import type { RoomEdit, RoomRepository } from '../room-repository';
import { createSheetsCrud, type EntitySpec } from './sheets-crud';
import type { SheetsClient } from './sheets-client';
import {
  booleanCell,
  cellValue,
  enumCell,
  numberCell,
  nullableBooleanCell,
  optionalNumberCell,
  requireCell,
  SheetRowError,
  type Tab,
  type TabContract,
} from './tab-reader';
import type { RowValues } from './tab-writer';

const TAB_NAME = 'rooms';

const KINDS: readonly SpaceKind[] = ['unit', 'common'];
const STATUSES: readonly RoomStatus[] = ['occupied', 'noticeGiven', 'available', 'maintenance'];

/**
 * `detail` is optional — a unit's `room_number` already is its label — so it
 * stays out of the identity set while remaining a column the console writes.
 */
const CONTRACT: TabContract = {
  columns: [
    'id',
    'room_number',
    'kind',
    'status',
    'rent_rate',
    'detail',
    'floor',
    'hasMeter',
    'has_tv',
    'has_fridge',
    'has_aircon',
    ARCHIVED_COLUMN,
  ],
  identity: [
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
    kind: enumCell(tab, row, rowNumber, 'kind', KINDS),
    status: enumCell(tab, row, rowNumber, 'status', STATUSES),
    // Rent, not a total bill — see the field's doc-comment in models/room.ts.
    rentRate: optionalNumberCell(tab, row, rowNumber, 'rent_rate'),
    hasMeter: booleanCell(tab, row, rowNumber, 'hasMeter'),
    // Blank is "not on file", not "no" — see RoomAppliances. `hasMeter`
    // above deliberately still rejects a blank: an unrecorded meter drops a
    // room out of the meter round, where an unrecorded fridge costs nothing
    // until the month-end report is built.
    appliances: {
      tv: nullableBooleanCell(tab, row, rowNumber, 'has_tv'),
      fridge: nullableBooleanCell(tab, row, rowNumber, 'has_fridge'),
      aircon: nullableBooleanCell(tab, row, rowNumber, 'has_aircon'),
    },
    archived: nullableBooleanCell(tab, row, rowNumber, ARCHIVED_COLUMN) ?? false,
  };
}

/**
 * The inverse of `parseRoom`, for the fields a room edit may touch.
 *
 * `label` writes to `detail` rather than `room_number`: the room number is
 * the physical identity the whole registry is keyed to, and letting a rename
 * change it would silently repoint every lease and meter reading. Renaming
 * ร้านซักผ้า should change what it is called, not which space it is.
 */
function toRowValues(fields: Partial<RoomEdit>): RowValues {
  const values: RowValues = {};

  if (fields.label !== undefined) values['detail'] = fields.label;
  if (fields.status !== undefined) values['status'] = fields.status;
  if (fields.hasMeter !== undefined) values['hasMeter'] = fields.hasMeter;
  // `null` is "no rate on record", which is a blank cell — never 0, which
  // would assert the space is free.
  if (fields.rentRate !== undefined) values['rent_rate'] = fields.rentRate ?? '';

  if (fields.appliances !== undefined) {
    // `null` is "not on file", which is a blank cell — writing the string
    // "null" would read back as a corrupted boolean and fail the whole tab.
    values['has_tv'] = fields.appliances.tv ?? '';
    values['has_fridge'] = fields.appliances.fridge ?? '';
    values['has_aircon'] = fields.appliances.aircon ?? '';
  }

  return values;
}

/** No `idPrefix`: rooms are edited, never created. See `RoomEdit`. */
const SPEC: EntitySpec<Room, RoomEdit> = {
  tabName: TAB_NAME,
  contract: CONTRACT,
  label: 'room',
  parse: parseRoom,
  toRowValues,
};

export function createSheetsRoomRepository(client: SheetsClient): RoomRepository {
  const crud = createSheetsCrud(client, SPEC);

  return {
    listRooms: crud.list,
    getRoom: crud.get,
    updateRoom: crud.update,
    archiveRoom: crud.archive,
  };
}
