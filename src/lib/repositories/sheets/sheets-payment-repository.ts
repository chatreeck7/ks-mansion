import { ARCHIVED_COLUMN } from '@/lib/models/archivable';
import {
  PAYMENT_METHODS,
  PAYMENT_MUST_BE_POSITIVE,
  type Payment,
  type PaymentDraft,
} from '@/lib/models/payment';
import type { PaymentRepository } from '../payment-repository';
import { formatThaiDate } from '@/lib/format/thai';
import { parseThaiDate } from '@/lib/format/thai-parse';
import { createSheetsCrud, type EntitySpec } from './sheets-crud';
import type { SheetsClient } from './sheets-client';
import {
  cellValue,
  enumCell,
  numberCell,
  nullableBooleanCell,
  requireCell,
  SheetRowError,
  type Tab,
  type TabContract,
  type TabDescriptor,
} from './tab-reader';
import type { RowValues } from './tab-writer';

const TAB_NAME = 'payments';

/**
 * `note` is blank on most rows, so it is contracted but not identity.
 *
 * **There is no `room_id` here, on purpose.** The room is the bill's, and
 * this tab has no way to check a copy of it: every other derived value in
 * this codebase is verified on read (`bills.total_amount` against its parts),
 * and one that cannot be verified is one that will eventually be wrong and
 * still believed. The console shows the room on every screen because it has
 * the bill; a person reading the tab by hand joins on `bill_id`.
 */
const CONTRACT: TabContract = {
  columns: ['id', 'bill_id', 'paid_on', 'amount', 'method', 'note', ARCHIVED_COLUMN],
  identity: ['id', 'bill_id', 'paid_on', 'amount'],
};

/** Dates are พ.ศ. text, same as bills and readings. See sheets-lease-repository. */
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

function parsePayment(tab: Tab, row: string[], rowNumber: number): Payment {
  const amount = numberCell(tab, row, rowNumber, 'amount');

  /**
   * Zero and negative are refused at the tab boundary, not only in the form.
   *
   * Zero is not a payment — it is the absence of one, and a row saying so
   * would make a bill look part-settled by nothing. Negative is a refund,
   * which has its own home with its own documented sign convention
   * (`move_out_paid` on the lease, AC-2.5). Accepting one here would put the
   * same baht in two places with opposite signs.
   */
  if (amount <= 0) {
    throw new SheetRowError(TAB_NAME, rowNumber, `"amount" must be greater than 0: "${amount}"`);
  }

  return {
    id: requireCell(tab, row, rowNumber, 'id'),
    billId: requireCell(tab, row, rowNumber, 'bill_id'),
    paidOn: parseDate(requireCell(tab, row, rowNumber, 'paid_on'), rowNumber, 'paid_on'),
    amount,
    method: enumCell(tab, row, rowNumber, 'method', PAYMENT_METHODS),
    note: cellValue(tab, row, 'note') || null,
    archived: nullableBooleanCell(tab, row, rowNumber, ARCHIVED_COLUMN) ?? false,
  };
}

function toRowValues(fields: Partial<PaymentDraft>): RowValues {
  const values: RowValues = {};

  if (fields.billId !== undefined) values['bill_id'] = fields.billId;
  if (fields.paidOn !== undefined) values['paid_on'] = formatThaiDate(fields.paidOn);
  if (fields.amount !== undefined) values['amount'] = fields.amount;
  if (fields.method !== undefined) values['method'] = fields.method;
  if (fields.note !== undefined) values['note'] = fields.note ?? '';

  return values;
}

/** The `payments` tab and its contract, for the health page to inspect. */
export const PAYMENTS_TAB: TabDescriptor = { tabName: TAB_NAME, contract: CONTRACT };

const SPEC: EntitySpec<Payment, PaymentDraft> = {
  tabName: TAB_NAME,
  contract: CONTRACT,
  label: 'payment',
  parse: parsePayment,
  toRowValues,
  idPrefix: 'p-',
};

export function createSheetsPaymentRepository(client: SheetsClient): PaymentRepository {
  const crud = createSheetsCrud(client, SPEC);

  return {
    listPayments: crud.list,
    getPayment: crud.get,
    voidPayment: crud.archive,

    async listPaymentsForBill(billId: string) {
      return (await crud.list()).filter((payment) => payment.billId === billId);
    },

    /**
     * The amount is checked here as well as in `parsePayment`, so a caller
     * gets the sentence explaining *where a refund belongs* rather than the
     * row-level "must be greater than 0" wrapped in "refusing to write an
     * unreadable payment row". Both guards are real: this one is the
     * message, the parser is the rule.
     */
    async recordPayment(draft: PaymentDraft) {
      if (draft.amount <= 0) throw new Error(PAYMENT_MUST_BE_POSITIVE);
      return crud.create({ ...draft, note: draft.note?.trim() || null });
    },
  };
}
