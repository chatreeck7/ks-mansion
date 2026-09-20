import { billDocumentFor, type BillDocument } from '@/lib/console/bill-document';
import type { Bill } from '@/lib/models/bill';
import type { BillingCycle } from '@/lib/models/billing-cycle';
import type { Payment } from '@/lib/models/payment';
import { inWalkingOrder, type Room } from '@/lib/models/room';

/**
 * A cycle's bills as one stack of slips to print (KS-24).
 *
 * **The job this exists for is the 26th.** Twenty-three bills are issued and
 * every one of them has to come off a printer. Before this, that meant
 * opening twenty-three URLs and pressing Ctrl-P twenty-three times — so the
 * console could produce a bill but could not produce a bill *run*, which is
 * the only form the work actually takes.
 *
 * **In walking order**, the same sequence as the meter round and the
 * collection sheet, because the stack is carried round the building in that
 * order and delivered off the top. A print run ordered by whatever the sheet
 * returned would have to be sorted by hand afterwards, which is worse than no
 * batch print at all.
 *
 * This is the whole-cycle *bill* run, not KS-30. KS-30 is one PDF with a
 * section per document *type* — bills, collection sheet, move-in/out log —
 * and needs an engine that can concatenate them. This needs a page and a
 * print dialog.
 */

export interface BillBatch {
  cycle: BillingCycle;
  /** One per bill, in walking order. Empty for a cycle not yet issued. */
  documents: BillDocument[];
  /**
   * What the stack adds up to.
   *
   * Printed on the cover line so it can be read against the same figure on
   * the bills page: if the two disagree, a bill is missing from the run and
   * the admin finds out before handing any of them over rather than after.
   */
  total: number;
}

export function billBatchFor(
  cycle: BillingCycle,
  bills: Bill[],
  rooms: Room[],
  payments: Payment[],
): BillBatch {
  const roomFor = new Map(rooms.map((room) => [room.id, room]));

  // Position in the walk, by room id. Archived rooms are gone from the
  // registry and so have no position — see below.
  const position = new Map(
    inWalkingOrder(rooms).map((room, index) => [room.id, index] as const),
  );

  const ordered = [...bills].sort((a, b) => {
    /**
     * A bill for a room that is no longer in the registry still prints, and
     * prints last.
     *
     * The room was archived after the bill was issued — the tenancy ended
     * mid-cycle. The bill is real, the money is owed, and dropping the slip
     * because its room has left the walk would lose it silently. It has no
     * place in the walk, so it goes after everything that does, keeping the
     * order the sheet gave it.
     */
    const left = position.get(a.roomId) ?? Number.MAX_SAFE_INTEGER;
    const right = position.get(b.roomId) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });

  // Every bill gets the full payment list: `settle` drops payments against
  // other bills and voided rows itself, so filtering per bill here would be a
  // second copy of a rule that already lives in one place.
  //
  // Archived bills are not filtered out either. `listBillsForCycle` excludes
  // them before they reach here, and a stack that quietly dropped one would
  // hide the fact — if one ever does get through, the document says
  // "ยกเลิกแล้ว" across its top, which is what an admin needs to see.
  const documents = ordered.map((bill) =>
    billDocumentFor(bill, roomFor.get(bill.roomId) ?? null, payments),
  );

  return {
    cycle,
    documents,
    total: documents.reduce((sum, doc) => sum + doc.total, 0),
  };
}
