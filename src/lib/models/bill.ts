import type { Archivable } from './archivable';

/**
 * One room's charges for one cycle.
 *
 * **Append-only** (docs/sheet-schema.md rule 6), like meter readings and for
 * the same reason: a bill that has been handed to a tenant is history. A
 * corrected bill is a new row, so the figure someone was actually asked to
 * pay stays reconstructable after the correction.
 *
 * **The amounts are stored, not recomputed.** This is the opposite of the
 * rule meter readings follow, and deliberately so. A reading's units are
 * arithmetic over two figures on the same row, so a stored copy could only
 * ever disagree with itself. A bill's figures come from *elsewhere* — the
 * occupant count on a lease, a meter reading, the room's rent rate — and all
 * three move. Recomputing an issued bill from today's inputs would silently
 * restate what was charged three months ago.
 */
export interface Bill extends Archivable {
  id: string;
  /**
   * Required, unlike `leaseId`. A room under แจ้งออก is billed utilities with
   * no rent, and a common space can be billed with no tenancy behind it — so
   * the room is what a bill is always *about*.
   */
  roomId: string;
  /** Null where there is no tenancy to point at. */
  leaseId: string | null;
  /** The cycle's id from `BillingCycle`, e.g. `2025-07`. */
  cycle: string;
  issueDate: Date;
  dueDate: Date;
  /**
   * Zero on a room under แจ้งออก — utilities only, no rent. Zero is a real
   * charge here, not a missing one.
   */
  rentAmount: number;
  electricityAmount: number;
  waterAmount: number;
  /**
   * ค้าง, as free text an admin writes — `ยอดค้าง 4,327`, `ค้างประกัน 1,000`.
   *
   * **Never inferred** (KS-22). The console does not decide that someone is
   * in arrears by comparing payments to bills; an admin asserts it. That is
   * why this is a note rather than an amount, and why it is not part of
   * `billTotal` — the number owed is settled between two people, and writing
   * a machine's opinion of it onto the bill would make the bill wrong in the
   * one place it must not be.
   */
  arrearsNote: string | null;
}

/** A bill before it has an id — what issuing a cycle produces. */
export type BillDraft = Omit<Bill, 'id' | 'archived'>;

/**
 * What the tenant is asked to pay.
 *
 * Derived, and deliberately excludes the arrears note: that note is text, and
 * the outstanding balance behind it is agreed between people rather than
 * computed here.
 */
export function billTotal(bill: Pick<Bill, 'rentAmount' | 'electricityAmount' | 'waterAmount'>): number {
  return bill.rentAmount + bill.electricityAmount + bill.waterAmount;
}

export function hasArrears(bill: Bill): boolean {
  return bill.arrearsNote !== null && bill.arrearsNote.trim() !== '';
}

/** True when this bill charges no rent — a room under แจ้งออก, or a vacancy. */
export function isUtilitiesOnly(bill: Bill): boolean {
  return bill.rentAmount === 0;
}
