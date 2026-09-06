import type { Payment, PaymentDraft } from '@/lib/models/payment';

/**
 * Payments are **recorded, never edited** (docs/sheet-schema.md rule 6).
 *
 * Same shape as `MeterReadingRepository`, and this one has no exception at
 * all — not even the one `BillRepository.annotateArrears` carves out. A
 * receipt says an amount arrived on a day; there is no field on it that can
 * change without changing that claim. A mis-keyed payment is **voided**
 * (`voidPayment`) and recorded again, which is what tearing a page out of a
 * carbon-copy receipt book already looks like.
 *
 * There is deliberately no `findPayment(billId)` returning one row: a bill
 * can be settled in instalments (แบ่งจ่าย), so "the payment for this bill" is
 * not a thing that exists. Callers ask for the list and use `settle`.
 */
export interface PaymentRepository {
  /** Every payment, oldest sheet row first. Excludes voided rows. */
  listPayments(): Promise<Payment[]>;
  /** One bill's payments — what a receipt and a settlement are built from. */
  listPaymentsForBill(billId: string): Promise<Payment[]>;
  /** Returns a voided payment too, so a receipt handed out still resolves. */
  getPayment(id: string): Promise<Payment | null>;

  recordPayment(draft: PaymentDraft): Promise<Payment>;

  /**
   * Withdraws a payment that should never have been recorded.
   *
   * Named for what it means rather than for how it is stored: the row is
   * archived (rule 7) and keeps its id forever, so a receipt someone is
   * holding still resolves to something that says it was voided, instead of
   * to nothing at all.
   */
  voidPayment(id: string): Promise<Payment>;
}
