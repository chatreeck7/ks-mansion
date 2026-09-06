import type { Bill, BillDraft } from '@/lib/models/bill';

/**
 * Bills are **issued, never edited** (docs/sheet-schema.md rule 6) — the same
 * shape as `MeterReadingRepository`, and for the same reason: a bill handed
 * to a tenant is history, so a correction is a new row rather than a change
 * to the one they were shown.
 *
 * The one exception is `annotateArrears`, and it is worth saying why it is
 * not an edit in disguise. ค้าง (KS-22) is an admin's assertion *about* a
 * bill, not one of its charges — it changes no amount and no total. Reissuing
 * a whole bill to add a sentence would put a second identical set of figures
 * into history and make the tenant's copy ambiguous. It is the only field on
 * a bill that may be written after issue, and that is deliberate rather than
 * an oversight in the append-only rule.
 */
export interface BillRepository {
  /** Every bill, oldest sheet row first. Excludes archived rows. */
  listBills(): Promise<Bill[]>;
  /** One cycle's bills — what a collection sheet is built from. */
  listBillsForCycle(cycle: string): Promise<Bill[]>;
  listBillsForRoom(roomId: string): Promise<Bill[]>;
  /** Returns an archived bill too, so a tenant's old copy stays traceable. */
  getBill(id: string): Promise<Bill | null>;

  /**
   * Whether this room already has a bill for this cycle.
   *
   * Issuing a cycle twice is the mistake worth preventing — the sheet would
   * take both rows happily, and the second would look like a correction of
   * the first rather than a duplicate. The caller checks; the repository does
   * not refuse, because a genuine reissue is also a second row.
   */
  findBill(roomId: string, cycle: string): Promise<Bill | null>;

  issueBill(draft: BillDraft): Promise<Bill>;
  /** The one post-issue write. Free text, never inferred — see above. */
  annotateArrears(id: string, note: string | null): Promise<Bill>;
  archiveBill(id: string): Promise<Bill>;
}
