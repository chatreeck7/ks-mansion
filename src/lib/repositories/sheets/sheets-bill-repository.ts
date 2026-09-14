import { ARCHIVED_COLUMN } from '@/lib/models/archivable';
import { billTotal, type Bill, type BillDraft } from '@/lib/models/bill';
import type { BillRepository } from '../bill-repository';
import { formatThaiDate } from '@/lib/format/thai';
import { parseThaiDate } from '@/lib/format/thai-parse';
import { createSheetsCrud, type EntitySpec } from './sheets-crud';
import type { SheetsClient } from './sheets-client';
import {
  cellValue,
  numberCell,
  nullableBooleanCell,
  requireCell,
  SheetRowError,
  type Tab,
  type TabContract,
  type TabDescriptor,
} from './tab-reader';
import type { RowValues } from './tab-writer';

const TAB_NAME = 'bills';

/**
 * `lease_id` and `arrears_note` are blank on plenty of legitimate rows, so
 * neither makes a row a record. Identity is the three columns from
 * docs/sheet-schema.md — a bill is one room's charges for one cycle.
 */
const CONTRACT: TabContract = {
  columns: [
    'id',
    'room_id',
    'lease_id',
    'cycle',
    'issue_date',
    'due_date',
    'rent_amount',
    'electricity_amount',
    'water_amount',
    'total_amount',
    'arrears_note',
    ARCHIVED_COLUMN,
  ],
  identity: ['id', 'room_id', 'cycle'],
};

/** Dates are พ.ศ. text, same as leases and readings. See sheets-lease-repository. */
function parseDate(raw: string, rowNumber: number, column: string): Date {
  const date = parseThaiDate(raw);
  if (!date) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"${column}" is not a Thai (พ.ศ.) date: "${raw}" — expected e.g. "26 ก.ค. 2568"`,
    );
  }
  return date;
}

/**
 * A charge. Zero is accepted and negative is not: a room under แจ้งออก
 * genuinely owes no rent, but nothing on a bill is ever owed backwards.
 */
function parseCharge(tab: Tab, row: string[], rowNumber: number, column: string): number {
  const value = numberCell(tab, row, rowNumber, column);
  if (value < 0) {
    throw new SheetRowError(TAB_NAME, rowNumber, `"${column}" cannot be negative: "${value}"`);
  }
  return value;
}

function parseBill(tab: Tab, row: string[], rowNumber: number): Bill {
  const issueRaw = requireCell(tab, row, rowNumber, 'issue_date');
  const issueDate = parseDate(issueRaw, rowNumber, 'issue_date');
  const dueRaw = requireCell(tab, row, rowNumber, 'due_date');
  const dueDate = parseDate(dueRaw, rowNumber, 'due_date');

  if (dueDate.getTime() < issueDate.getTime()) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"due_date" (${dueRaw}) is before "issue_date" (${issueRaw})`,
    );
  }

  const bill: Bill = {
    id: requireCell(tab, row, rowNumber, 'id'),
    roomId: requireCell(tab, row, rowNumber, 'room_id'),
    leaseId: cellValue(tab, row, 'lease_id') || null,
    cycle: requireCell(tab, row, rowNumber, 'cycle'),
    issueDate,
    dueDate,
    rentAmount: parseCharge(tab, row, rowNumber, 'rent_amount'),
    electricityAmount: parseCharge(tab, row, rowNumber, 'electricity_amount'),
    waterAmount: parseCharge(tab, row, rowNumber, 'water_amount'),
    arrearsNote: cellValue(tab, row, 'arrears_note') || null,
    archived: nullableBooleanCell(tab, row, rowNumber, ARCHIVED_COLUMN) ?? false,
  };

  /**
   * `total_amount` is in the sheet but is never *trusted*.
   *
   * The column exists because the tab is read and summed by people, and a
   * bill with no total on it is not a bill. But a stored total is a second
   * place for the arithmetic to live, in a file admins edit by hand — so it
   * is checked against the parts rather than believed, and a disagreement
   * fails the row loudly instead of quietly deciding which number is right.
   * The console owns this column (schema rule 5) and recomputes it on write.
   */
  const expected = billTotal(bill);
  const stated = parseCharge(tab, row, rowNumber, 'total_amount');
  if (stated !== expected) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"total_amount" is ${stated} but the charges add up to ${expected} ` +
        `(${bill.rentAmount} + ${bill.electricityAmount} + ${bill.waterAmount})`,
    );
  }

  return bill;
}

function toRowValues(fields: Partial<BillDraft>): RowValues {
  const values: RowValues = {};

  if (fields.roomId !== undefined) values['room_id'] = fields.roomId;
  if (fields.leaseId !== undefined) values['lease_id'] = fields.leaseId ?? '';
  if (fields.cycle !== undefined) values['cycle'] = fields.cycle;
  if (fields.issueDate !== undefined) values['issue_date'] = formatThaiDate(fields.issueDate);
  if (fields.dueDate !== undefined) values['due_date'] = formatThaiDate(fields.dueDate);
  if (fields.arrearsNote !== undefined) values['arrears_note'] = fields.arrearsNote ?? '';

  // The three charges move together, and the total is derived from them here
  // rather than accepted from a caller — one place computes it, and it is the
  // same place the reader checks against.
  const charges = [fields.rentAmount, fields.electricityAmount, fields.waterAmount];
  if (charges.some((amount) => amount !== undefined)) {
    if (charges.some((amount) => amount === undefined)) {
      throw new Error(
        'A bill\'s rent, electricity and water amounts must be written together — ' +
          'writing one alone would leave "total_amount" disagreeing with the parts.',
      );
    }
    values['rent_amount'] = fields.rentAmount!;
    values['electricity_amount'] = fields.electricityAmount!;
    values['water_amount'] = fields.waterAmount!;
    values['total_amount'] = billTotal({
      rentAmount: fields.rentAmount!,
      electricityAmount: fields.electricityAmount!,
      waterAmount: fields.waterAmount!,
    });
  }

  return values;
}

/** The `bills` tab and its contract, for the health page to inspect. */
export const BILLS_TAB: TabDescriptor = { tabName: TAB_NAME, contract: CONTRACT };

const SPEC: EntitySpec<Bill, BillDraft> = {
  tabName: TAB_NAME,
  contract: CONTRACT,
  label: 'bill',
  parse: parseBill,
  toRowValues,
  idPrefix: 'b-',
};

export function createSheetsBillRepository(client: SheetsClient): BillRepository {
  const crud = createSheetsCrud(client, SPEC);

  return {
    listBills: crud.list,
    getBill: crud.get,
    issueBill: crud.create,
    archiveBill: crud.archive,

    async listBillsForCycle(cycle: string) {
      return (await crud.list()).filter((bill) => bill.cycle === cycle);
    },

    async listBillsForRoom(roomId: string) {
      return (await crud.list()).filter((bill) => bill.roomId === roomId);
    },

    async findBill(roomId: string, cycle: string) {
      return (
        (await crud.list()).find((bill) => bill.roomId === roomId && bill.cycle === cycle) ?? null
      );
    },

    /**
     * The only field writable after issue (KS-22). Goes through the same
     * update path as everything else, so the row is still parsed before it is
     * written and a note cannot corrupt a bill's figures.
     */
    async annotateArrears(id: string, note: string | null) {
      return crud.update(id, { arrearsNote: note?.trim() || null });
    },
  };
}
