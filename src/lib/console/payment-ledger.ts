import { formatBaht, formatThaiDate } from '@/lib/format/thai';
import { parseThaiDate } from '@/lib/format/thai-parse';
import type { Bill } from '@/lib/models/bill';
import type { LedgerColumn, LedgerGroup, LedgerRow } from '@/lib/models/ledger';
import type { PillTone } from '@/lib/models/pill-tone';
import {
  settle,
  settlementLabel,
  type Payment,
  type PaymentDraft,
  type PaymentMethod,
  type Settlement,
  type SettlementState,
} from '@/lib/models/payment';
import type { Room } from '@/lib/models/room';

/**
 * Recording a cycle's payments (KS-23).
 *
 * **Shaped like the paper it replaces.** แบบฟอร์มเก็บเงินค่าห้อง is one sheet
 * for the whole building with a column per day of the collection window —
 * `26 27 28 … 10` — and an admin fills in the cell under today's date. So
 * this screen takes **one date and one method for the whole submission** and
 * an amount per room, rather than four fields on each of twenty-seven rows.
 * A session is either "went through this morning's transfers" or "counted
 * what came in at the desk"; a room that breaks the pattern is a second
 * submit, not a reason to put a method selector on every line.
 *
 * **Nothing is prefilled with what is owed.** The outstanding amount sits
 * beside the field where it can be read, but typing it is the admin's act —
 * a prefilled grid one submit away from recording twenty-seven payments that
 * never arrived is not a convenience.
 */

export const PAYMENT_COLUMNS: LedgerColumn[] = [
  { key: 'room', header: 'ห้อง' },
  { key: 'due', header: 'ยอดบิล', align: 'right' },
  { key: 'paid', header: 'จ่ายแล้ว', align: 'right' },
  { key: 'outstanding', header: 'คงเหลือ', align: 'right' },
  { key: 'amount', header: 'รับเงิน', align: 'right' },
  { key: 'note', header: 'หมายเหตุ' },
  { key: 'state', header: 'สถานะ' },
];

export interface PaymentRow {
  bill: Bill;
  roomLabel: string;
  settlement: Settlement;
}

export function amountFieldName(bill: Bill): string {
  return `paid:${bill.id}`;
}

export function noteFieldName(bill: Bill): string {
  return `paidnote:${bill.id}`;
}

/** Just enough of `FormData` to read a submission back without a DOM. */
export interface SubmittedPayments {
  get(name: string): FormDataEntryValue | null;
}

/**
 * One row per issued bill, in the order the bills were issued.
 *
 * Bills are the spine rather than rooms: a room with no bill this cycle has
 * nothing to pay, and a vacant room does not appear at all because KS-21
 * never billed it.
 */
export function paymentRows(bills: Bill[], payments: Payment[], rooms: Room[]): PaymentRow[] {
  const labels = new Map(rooms.map((room) => [room.id, room.label]));

  return bills.map((bill) => ({
    bill,
    // Falls back to the id rather than to an em dash: a bill for a room that
    // has since been archived still has to be collectable.
    roomLabel: labels.get(bill.roomId) ?? bill.roomId,
    settlement: settle(bill, payments),
  }));
}

const STATE_TONES: Record<SettlementState, PillTone> = {
  unpaid: 'warn',
  partial: 'warn',
  paid: 'ok',
  // Not an error: arrears from an earlier cycle are cleared in the same
  // transfer, so more than the bill's own total is a normal Friday.
  overpaid: 'mute',
};

export function toPaymentGroups(
  rows: PaymentRow[],
  label: string,
  submitted?: SubmittedPayments,
): LedgerGroup[] {
  const ledgerRows: LedgerRow[] = rows.map(({ bill, roomLabel, settlement }): LedgerRow => {
    const typed = (name: string) => {
      const value = submitted?.get(name);
      return typeof value === 'string' ? value : '';
    };

    return {
      id: bill.id,
      cells: {
        room: { kind: 'text', value: roomLabel },
        due: { kind: 'figure', value: settlement.due },
        paid: { kind: 'figure', value: settlement.paid },
        outstanding: { kind: 'figure', value: settlement.outstanding },
        amount: {
          kind: 'input',
          name: amountFieldName(bill),
          value: typed(amountFieldName(bill)),
          label: `รับเงิน ห้อง ${roomLabel}`,
          // The outstanding amount as a hint, not as a value: reading it is
          // free, and typing it stays a decision.
          placeholder: settlement.outstanding > 0 ? formatBaht(settlement.outstanding) : '',
        },
        note: {
          kind: 'input',
          name: noteFieldName(bill),
          value: typed(noteFieldName(bill)),
          label: `หมายเหตุการรับเงิน ห้อง ${roomLabel}`,
          placeholder: 'เช่น โอนในชื่อ Frame',
          mode: 'text',
        },
        state: {
          kind: 'pill',
          tone: STATE_TONES[settlement.state],
          label: settlementLabel(settlement.state),
        },
      },
    };
  });

  return [{ label, rows: ledgerRows }];
}

/** Midnight local, so a comparison is by day and ignores the time. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export interface PaymentSubmission {
  drafts: PaymentDraft[];
  errors: string[];
}

/**
 * Digits, optional thousands separators, optional satang. Nothing else.
 *
 * **`Number()` is not a validator for money**, which this screen found the
 * hard way: `2,6e6` — a plausible slip of the hand on a keyboard, from
 * `2,636` — strips to `26e6`, parses as finite, and records ฿26,000,000
 * against a ฿2,636 bill. `0x…`, `Infinity` and a leading `+` do the same
 * thing more obviously. A pattern that only admits what a baht figure looks
 * like closes all of them at once, and a wrong amount recorded against a
 * tenant is the most expensive mistake this console can make.
 */
const BAHT = /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/;

/**
 * An amount typed into a cell.
 *
 * Blank means "no payment from this room today", which is the ordinary state
 * of most rows on most days — the opposite of the water screen, where a blank
 * occupant count is a deleted fact. Separators are accepted because the
 * figure beside the field is printed with them and people copy what they see.
 */
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!BAHT.test(trimmed)) return NaN;
  return Number(trimmed.replace(/,/g, ''));
}

/**
 * The payments a submission actually asks for.
 *
 * Errors and drafts come back together rather than the first bad cell
 * aborting the lot: twenty-six good rows should still be recorded when the
 * twenty-seventh has a typo in it, and the admin should see which one.
 */
export function paymentsFromForm(
  rows: PaymentRow[],
  form: SubmittedPayments,
  paidOn: Date,
  method: PaymentMethod,
): PaymentSubmission {
  const drafts: PaymentDraft[] = [];
  const errors: string[] = [];

  for (const { bill, roomLabel } of rows) {
    /**
     * Money cannot arrive for a bill that did not exist yet.
     *
     * Not a policy about lateness — a payment *after* the due date is
     * ordinary and is recorded without comment. This is arithmetic: the
     * screen defaults to today but lets the date be typed, and a slip of the
     * year lands a receipt reading `ยอดชำระเดือน ส.ค. 2569` beside
     * `วันที่รับเงิน 28 มี.ค. 2568`. Found by driving the screen, not by
     * reading it.
     */
    if (paidOn.getTime() < startOfDay(bill.issueDate)) {
      const raw = form.get(amountFieldName(bill));
      if (typeof raw === 'string' && raw.trim() !== '') {
        errors.push(
          `ห้อง ${roomLabel}: วันที่รับเงินอยู่ก่อนวันออกบิล (${formatThaiDate(bill.issueDate)})`,
        );
      }
      continue;
    }

    const raw = form.get(amountFieldName(bill));
    if (typeof raw !== 'string') continue;

    const amount = parseAmount(raw);
    if (amount === null) continue;

    if (Number.isNaN(amount)) {
      errors.push(`ห้อง ${roomLabel}: "${raw.trim()}" ไม่ใช่จำนวนเงิน`);
      continue;
    }
    if (amount <= 0) {
      errors.push(`ห้อง ${roomLabel}: จำนวนเงินต้องมากกว่า 0`);
      continue;
    }

    const note = form.get(noteFieldName(bill));
    drafts.push({
      billId: bill.id,
      paidOn,
      amount,
      method,
      note: typeof note === 'string' ? note.trim() || null : null,
    });
  }

  return { drafts, errors };
}

/**
 * The date the whole submission is recorded under.
 *
 * Typed as พ.ศ. text like every other date in the console, and defaulted to
 * today — but editable, because reconciliation runs a day or two behind the
 * transfers it is reconciling and the payment belongs to the day the money
 * arrived, not the day it was keyed in.
 */
export function parsePaidOn(raw: unknown, today: Date): { date: Date | null; error: string | null } {
  if (typeof raw !== 'string' || raw.trim() === '') return { date: today, error: null };

  const date = parseThaiDate(raw);
  if (!date) {
    return {
      date: null,
      error: `วันที่รับเงิน "${raw.trim()}" อ่านไม่ออก — เช่น ${formatThaiDate(today)}`,
    };
  }

  // A year typed as 2570 is a typo, not a plan: nobody has received money
  // tomorrow. The other end is per-bill and belongs with the bill — see
  // `paymentsFromForm`.
  if (startOfDay(date) > startOfDay(today)) {
    return { date: null, error: `วันที่รับเงิน "${raw.trim()}" อยู่ในอนาคต` };
  }

  return { date, error: null };
}
