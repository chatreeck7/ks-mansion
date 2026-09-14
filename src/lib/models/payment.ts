import type { Archivable } from './archivable';
import { billTotal, type Bill } from './bill';

/**
 * Money received against a bill (KS-23).
 *
 * **The console records payments; it does not take them.** Reconciliation
 * happens outside, in LINE OA and the bank app (NFR-1.3) — so a row here is
 * an admin asserting "this arrived", never the result of a gateway callback.
 * That is why there is no `pending` state and no reference number the console
 * could verify: by the time anyone types this in, the money is already in the
 * account.
 *
 * **Append-only** (docs/sheet-schema.md rule 6), like bills and readings. A
 * receipt handed to a tenant is history; there is no `updatePayment`. A
 * mis-keyed amount is voided (archived) and re-recorded, which is what
 * tearing a page out of a carbon-copy receipt book already looks like.
 */
export interface Payment extends Archivable {
  id: string;
  /**
   * The bill this settles. Required — a payment always answers a charge.
   *
   * Deposits and advance rent are deliberately *not* payments in this sense:
   * they are `move_in_paid` / `move_out_paid` on the lease, because exactly
   * one of each exists per tenancy (docs/sheet-schema.md §leases). Routing
   * them here as well would put the same baht in two places.
   */
  billId: string;
  /**
   * The day the money arrived, not the day it was typed in.
   *
   * This is the column of the collection form — `26 27 28 … 10` — so a
   * payment recorded three days late still lands in the right cell of it.
   */
  paidOn: Date;
  /** Always positive. See `PAYMENT_MUST_BE_POSITIVE`. */
  amount: number;
  method: PaymentMethod;
  /**
   * Free text, and it earns its place: the collection form's own footer is a
   * list of nicknames against transfer handles — `หลิว - Frame`,
   * `จูน - Mueng` — because a transfer arrives under a name that is not the
   * tenant's. Without somewhere to write that down, the reconciliation is
   * only in the admin's head.
   */
  note: string | null;
}

/**
 * โอน or เงินสด. Two values rather than free text, because these are the two
 * the building actually has: the bill prints a bank account to transfer to,
 * and the same slip carries a ผู้รับเงิน signature line for money handed over
 * at the desk.
 */
export type PaymentMethod = 'transfer' | 'cash';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['transfer', 'cash'];

const METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: 'โอน',
  cash: 'เงินสด',
};

export function paymentMethodLabel(method: PaymentMethod): string {
  return METHOD_LABELS[method];
}

/** A payment before it has an id — what recording one produces. */
export type PaymentDraft = Omit<Payment, 'id' | 'archived'>;

/**
 * Why zero and negative are refused, in one place both the model and the
 * repository can point at.
 *
 * A refund is not a negative payment. Money going back to a tenant is a
 * deposit settlement, and it already has a home with a documented sign
 * convention — `move_out_due` / `move_out_paid` on the lease (AC-2.5). Two
 * places to record a refund is two places for a balance to be wrong.
 */
export const PAYMENT_MUST_BE_POSITIVE =
  'จำนวนเงินต้องมากกว่า 0 — การคืนเงินประกันบันทึกที่สัญญาเช่า (move_out_paid) ไม่ใช่ที่นี่';

// ------------------------------------------------------------- settlement

export type SettlementState = 'unpaid' | 'partial' | 'paid' | 'overpaid';

export interface Settlement {
  billId: string;
  /** What the bill asked for. Excludes the arrears note, as `billTotal` does. */
  due: number;
  paid: number;
  /** `due − paid`. Negative when more arrived than this bill asked for. */
  outstanding: number;
  state: SettlementState;
  /** Oldest first — an instalment history reads in the order it happened. */
  payments: Payment[];
}

/**
 * What one bill stands at.
 *
 * **Overpayment is a normal outcome, never an error.** The collection form
 * proves it: room 306 is billed 3,900 with `ยอดค้าง 4,327` written beside it,
 * and one transfer clears both. A rule that refused more than the bill's own
 * total would make the commonest way a debt gets settled unrecordable.
 *
 * **Part payment is also normal** — that is what `ยอดค้าง` *is*, and the
 * owner's own description of the register's split figures: แบ่งจ่าย, an
 * instalment, not a discount. So many payments may point at one bill.
 *
 * Nothing here decides that someone is in arrears. That stays an admin's
 * assertion on the bill (KS-22): this arithmetic knows what was billed and
 * what arrived, and not what was agreed between two people.
 */
export function settle(bill: Bill, payments: Payment[]): Settlement {
  const mine = payments
    .filter((payment) => payment.billId === bill.id && !payment.archived)
    .sort((a, b) => a.paidOn.getTime() - b.paidOn.getTime());

  const due = billTotal(bill);
  const paid = mine.reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = due - paid;

  return { billId: bill.id, due, paid, outstanding, state: stateOf(paid, outstanding), payments: mine };
}

function stateOf(paid: number, outstanding: number): SettlementState {
  if (paid === 0) return 'unpaid';
  if (outstanding > 0) return 'partial';
  return outstanding === 0 ? 'paid' : 'overpaid';
}

const STATE_LABELS: Record<SettlementState, string> = {
  unpaid: 'ยังไม่จ่าย',
  partial: 'จ่ายบางส่วน',
  paid: 'จ่ายครบ',
  overpaid: 'จ่ายเกิน',
};

export function settlementLabel(state: SettlementState): string {
  return STATE_LABELS[state];
}
