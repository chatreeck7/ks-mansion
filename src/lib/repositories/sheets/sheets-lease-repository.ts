import { ARCHIVED_COLUMN } from '@/lib/models/archivable';
import type { Lease, LeaseEndReason } from '@/lib/models/lease';
import type { LeaseDraft, LeaseRepository } from '../lease-repository';
import { formatThaiDate } from '@/lib/format/thai';
import { parseThaiDate } from '@/lib/format/thai-parse';
import { createSheetsCrud, type EntitySpec } from './sheets-crud';
import type { SheetsClient } from './sheets-client';
import {
  cellValue,
  numberCell,
  nullableBooleanCell,
  optionalEnumCell,
  requireCell,
  SheetRowError,
  type Tab,
  type TabContract,
  type TabDescriptor,
} from './tab-reader';
import type { RowValues } from './tab-writer';

const TAB_NAME = 'leases';

const END_REASONS: readonly LeaseEndReason[] = ['normal', 'absconded'];

/**
 * `end_date`, `signed_date`, `end_reason` and `previous_lease_id` are blank on
 * a running, first-room tenancy, so none of them makes a row a record. The
 * columns must still exist — see the tenants contract for why.
 */
const CONTRACT: TabContract = {
  columns: [
    'id',
    'room_id',
    'tenant_id',
    'start_date',
    'end_date',
    'signed_date',
    'rent_rate',
    'deposit',
    'advance_rent',
    'occupant_count',
    'end_reason',
    'previous_lease_id',
    ARCHIVED_COLUMN,
  ],
  identity: ['id', 'room_id', 'tenant_id', 'start_date'],
};

/**
 * Dates are stored as **Thai Buddhist-era text** (`1 มี.ค. 2568` or
 * `1/3/2568`), not ISO.
 *
 * Two reasons. Admins read and write these cells directly and think in พ.ศ.,
 * so BE matches the paperwork they are copying from. And `parseThaiDate`
 * *rejects* a Gregorian year outright rather than reinterpreting it — a cell
 * reading `2026` fails loudly instead of silently becoming 1483 CE. Storing
 * ISO would make the common mistake (typing a BE year into a CE field)
 * silent, which is precisely the wrong trade for a field that drives billing
 * and deposit settlement.
 *
 * The column must be formatted as **plain text** in Sheets, and the write
 * path sends `valueInputOption=RAW` so Sheets never reinterprets what the
 * console puts there. See docs/admin-collaboration.md.
 */
function parseDate(raw: string, rowNumber: number, column: string): Date {
  const date = parseThaiDate(raw);
  if (!date) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"${column}" is not a Thai (พ.ศ.) date: "${raw}" — expected e.g. "1 มี.ค. 2568" or "1/3/2568"`,
    );
  }
  return date;
}

function parseMoney(tab: Tab, row: string[], rowNumber: number, column: string): number {
  const value = numberCell(tab, row, rowNumber, column);
  if (value < 0) {
    throw new SheetRowError(TAB_NAME, rowNumber, `"${column}" cannot be negative: "${value}"`);
  }
  return value;
}

/**
 * จำนวนผู้พัก, which is a billing input rather than a note: ค่าน้ำ is
 * occupants × 100.
 *
 * Blank is rejected, not defaulted. That is the failure the source
 * spreadsheet warns about in its own instructions — leave it out and the
 * water charge silently comes out wrong rather than absent. Zero *is*
 * accepted: ร้านซักผ้า is a shop on its own water meter, not a home.
 */
function parseOccupantCount(tab: Tab, row: string[], rowNumber: number): number {
  const count = numberCell(tab, row, rowNumber, 'occupant_count');
  if (!Number.isInteger(count) || count < 0) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"occupant_count" must be a whole number of people, got "${cellValue(tab, row, 'occupant_count')}"`,
    );
  }
  return count;
}

function parseLease(tab: Tab, row: string[], rowNumber: number): Lease {
  const id = requireCell(tab, row, rowNumber, 'id');
  const startRaw = cellValue(tab, row, 'start_date');
  const startDate = parseDate(startRaw, rowNumber, 'start_date');

  const endRaw = cellValue(tab, row, 'end_date');
  const endDate = endRaw ? parseDate(endRaw, rowNumber, 'end_date') : null;

  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"end_date" (${endRaw}) is before "start_date" (${startRaw})`,
    );
  }

  const signedRaw = cellValue(tab, row, 'signed_date');
  const signedDate = signedRaw ? parseDate(signedRaw, rowNumber, 'signed_date') : null;

  const endReason = optionalEnumCell(tab, row, rowNumber, 'end_reason', END_REASONS);
  // A tenancy cannot have ended in a particular way and still be running.
  // Left unchecked this reads as an active lease that also absconded, and
  // every later summary silently double-counts the room.
  if (endReason && !endDate) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"end_reason" is "${endReason}" but "end_date" is blank — a lease that ended needs an end date`,
    );
  }

  const previousLeaseId = cellValue(tab, row, 'previous_lease_id') || null;
  if (previousLeaseId === id) {
    throw new SheetRowError(TAB_NAME, rowNumber, `"previous_lease_id" points at its own row`);
  }

  return {
    id,
    roomId: requireCell(tab, row, rowNumber, 'room_id'),
    tenantId: requireCell(tab, row, rowNumber, 'tenant_id'),
    startDate,
    endDate,
    signedDate,
    rentRate: parseMoney(tab, row, rowNumber, 'rent_rate'),
    deposit: parseMoney(tab, row, rowNumber, 'deposit'),
    advanceRent: parseMoney(tab, row, rowNumber, 'advance_rent'),
    occupantCount: parseOccupantCount(tab, row, rowNumber),
    endReason,
    previousLeaseId,
    archived: nullableBooleanCell(tab, row, rowNumber, ARCHIVED_COLUMN) ?? false,
  };
}

/**
 * The inverse of `parseLease`.
 *
 * Dates go out through `formatThaiDate`, the same function the console
 * displays them with — so what is written is what an admin would have typed,
 * in พ.ศ., and reads back through `parseThaiDate` unchanged. Writing an ISO
 * date here would be silently accepted by the sheet and then rejected by
 * every subsequent read.
 */
function toRowValues(fields: Partial<LeaseDraft>): RowValues {
  const values: RowValues = {};

  if (fields.roomId !== undefined) values['room_id'] = fields.roomId;
  if (fields.tenantId !== undefined) values['tenant_id'] = fields.tenantId;
  if (fields.startDate !== undefined) values['start_date'] = formatThaiDate(fields.startDate);
  if (fields.endDate !== undefined) {
    values['end_date'] = fields.endDate ? formatThaiDate(fields.endDate) : '';
  }
  if (fields.signedDate !== undefined) {
    values['signed_date'] = fields.signedDate ? formatThaiDate(fields.signedDate) : '';
  }
  if (fields.rentRate !== undefined) values['rent_rate'] = fields.rentRate;
  if (fields.deposit !== undefined) values['deposit'] = fields.deposit;
  if (fields.advanceRent !== undefined) values['advance_rent'] = fields.advanceRent;
  if (fields.occupantCount !== undefined) values['occupant_count'] = fields.occupantCount;
  if (fields.endReason !== undefined) values['end_reason'] = fields.endReason ?? '';
  if (fields.previousLeaseId !== undefined) {
    values['previous_lease_id'] = fields.previousLeaseId ?? '';
  }

  return values;
}

/** The `leases` tab and its contract, for the health page to inspect. */
export const LEASES_TAB: TabDescriptor = { tabName: TAB_NAME, contract: CONTRACT };

const SPEC: EntitySpec<Lease, LeaseDraft> = {
  tabName: TAB_NAME,
  contract: CONTRACT,
  label: 'lease',
  parse: parseLease,
  toRowValues,
  idPrefix: 'l-',
};

export function createSheetsLeaseRepository(client: SheetsClient): LeaseRepository {
  const crud = createSheetsCrud(client, SPEC);

  return {
    listLeases: crud.list,
    getLease: crud.get,
    createLease: crud.create,
    updateLease: crud.update,
    archiveLease: crud.archive,

    async listLeasesForRoom(roomId: string) {
      return (await crud.list()).filter((lease) => lease.roomId === roomId);
    },
    async listLeasesForTenant(tenantId: string) {
      return (await crud.list()).filter((lease) => lease.tenantId === tenantId);
    },
  };
}
