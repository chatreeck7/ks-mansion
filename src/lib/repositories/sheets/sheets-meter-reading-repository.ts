import { ARCHIVED_COLUMN } from '@/lib/models/archivable';
import {
  METER_TYPES,
  type MeterReading,
  type MeterReadingDraft,
  type MeterType,
} from '@/lib/models/meter-reading';
import type { MeterReadingRepository } from '../meter-reading-repository';
import { formatThaiDate } from '@/lib/format/thai';
import { parseThaiDate } from '@/lib/format/thai-parse';
import { createSheetsCrud, type EntitySpec } from './sheets-crud';
import type { SheetsClient } from './sheets-client';
import {
  cellValue,
  enumCell,
  nullableBooleanCell,
  numberCell,
  requireCell,
  SheetRowError,
  type Tab,
  type TabContract,
  type TabDescriptor,
} from './tab-reader';
import type { RowValues } from './tab-writer';

const TAB_NAME = 'meter_readings';

/**
 * `note` may be blank on almost every row — most readings are unremarkable —
 * so it is not part of what makes a row a record. Its *presence* in the
 * header is still required: a typo there would make every note silently
 * unreadable, which is the failure the split between `columns` and
 * `identity` exists for.
 *
 * Identity is the four columns from docs/sheet-schema.md: a reading is
 * identified by which meter it came off and when, not by the room alone.
 */
const CONTRACT: TabContract = {
  columns: [
    'id',
    'room_id',
    'meter_type',
    'read_date',
    'previous_reading',
    'current_reading',
    'rate_per_unit',
    'note',
    ARCHIVED_COLUMN,
  ],
  identity: ['id', 'room_id', 'meter_type', 'read_date'],
};

/**
 * `read_date` is **Thai Buddhist-era text** in a plain-text column, the same
 * as the lease dates and for the same reason: admins read and write these
 * cells directly and think in พ.ศ., and `parseThaiDate` rejects a Gregorian
 * year outright rather than reinterpreting it. See sheets-lease-repository.
 */
function parseDate(raw: string, rowNumber: number): Date {
  const date = parseThaiDate(raw);
  if (!date) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"read_date" is not a Thai (พ.ศ.) date: "${raw}" — expected e.g. "26 มี.ค. 2568" or "26/3/2568"`,
    );
  }
  return date;
}

/**
 * A dial figure. Negative is rejected outright — a meter does not run
 * backwards, and the value feeds a charge.
 */
function parseDial(tab: Tab, row: string[], rowNumber: number, column: string): number {
  const value = numberCell(tab, row, rowNumber, column);
  if (value < 0) {
    throw new SheetRowError(TAB_NAME, rowNumber, `"${column}" cannot be negative: "${value}"`);
  }
  return value;
}

function parseMeterReading(tab: Tab, row: string[], rowNumber: number): MeterReading {
  const previousReading = parseDial(tab, row, rowNumber, 'previous_reading');
  const currentReading = parseDial(tab, row, rowNumber, 'current_reading');

  // Rejected rather than allowed to produce negative units. A reading below
  // its predecessor is very nearly always a transposed digit, and the cost of
  // the two mistakes is not symmetric: refusing a genuine case asks an admin
  // to look at the row, while accepting a typo quietly *credits* a tenant on
  // a bill nobody re-checks. A real meter rollover is recorded as a fresh
  // reading whose `previous_reading` is the rolled-over figure, with the
  // reason in `note`.
  if (currentReading < previousReading) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"current_reading" (${currentReading}) is below "previous_reading" (${previousReading}) — ` +
        `a meter does not run backwards`,
    );
  }

  const ratePerUnit = numberCell(tab, row, rowNumber, 'rate_per_unit');
  if (ratePerUnit < 0) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"rate_per_unit" cannot be negative: "${ratePerUnit}"`,
    );
  }

  return {
    id: requireCell(tab, row, rowNumber, 'id'),
    roomId: requireCell(tab, row, rowNumber, 'room_id'),
    meterType: enumCell(tab, row, rowNumber, 'meter_type', METER_TYPES),
    readDate: parseDate(requireCell(tab, row, rowNumber, 'read_date'), rowNumber),
    previousReading,
    currentReading,
    ratePerUnit,
    note: cellValue(tab, row, 'note') || null,
    archived: nullableBooleanCell(tab, row, rowNumber, ARCHIVED_COLUMN) ?? false,
  };
}

/** The inverse of `parseMeterReading`. Dates go out in พ.ศ., as they came in. */
function toRowValues(fields: Partial<MeterReadingDraft>): RowValues {
  const values: RowValues = {};

  if (fields.roomId !== undefined) values['room_id'] = fields.roomId;
  if (fields.meterType !== undefined) values['meter_type'] = fields.meterType;
  if (fields.readDate !== undefined) values['read_date'] = formatThaiDate(fields.readDate);
  if (fields.previousReading !== undefined) values['previous_reading'] = fields.previousReading;
  if (fields.currentReading !== undefined) values['current_reading'] = fields.currentReading;
  if (fields.ratePerUnit !== undefined) values['rate_per_unit'] = fields.ratePerUnit;
  if (fields.note !== undefined) values['note'] = fields.note ?? '';

  return values;
}

/** The `meter_readings` tab and its contract, for the health page to inspect. */
export const METER_READINGS_TAB: TabDescriptor = { tabName: TAB_NAME, contract: CONTRACT };

const SPEC: EntitySpec<MeterReading, MeterReadingDraft> = {
  tabName: TAB_NAME,
  contract: CONTRACT,
  label: 'meter reading',
  parse: parseMeterReading,
  toRowValues,
  idPrefix: 'm-',
};

export function createSheetsMeterReadingRepository(client: SheetsClient): MeterReadingRepository {
  const crud = createSheetsCrud(client, SPEC);

  return {
    listReadings: crud.list,
    getReading: crud.get,
    recordReading: crud.create,
    archiveReading: crud.archive,

    async listReadingsForRoom(roomId: string) {
      return (await crud.list()).filter((reading) => reading.roomId === roomId);
    },

    async latestReading(roomId: string, meterType: MeterType) {
      let latest: MeterReading | null = null;
      for (const reading of await crud.list()) {
        if (reading.roomId !== roomId || reading.meterType !== meterType) continue;
        // `>=`, not `>`: two readings on one date is what a correction looks
        // like — the เก็บตก sweep re-reads a room the same evening — and the
        // later row is the one that supersedes.
        if (!latest || reading.readDate.getTime() >= latest.readDate.getTime()) latest = reading;
      }
      return latest;
    },
  };
}
