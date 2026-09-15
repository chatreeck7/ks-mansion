import { billTotal, hasArrears, type Bill } from '@/lib/models/bill';
import { cycleIssuedIn, rentLabel, utilityLabel } from '@/lib/models/billing-cycle';
import { settle, type Payment, type Settlement } from '@/lib/models/payment';
import type { Room } from '@/lib/models/room';
import { formatThaiDate, formatThaiMonth } from '@/lib/format/thai';

/**
 * ใบแจ้งค่าห้องพัก — the bill as a document a tenant is handed (KS-24).
 *
 * **The receipt was built from this, not the other way round.** KS-23 found
 * that the building has no separate receipt: ใบแจ้งค่าห้องพัก carries
 * `ผู้รับเงิน` / `ผู้ชำระเงิน` lines at its foot, and signed, the bill *is*
 * the receipt. So this restores the original document, and the two share
 * their charge lines deliberately — same labels, same order, same derivation
 * — because a tenant comparing the slip they were given with the one they
 * signed must find the same figures in the same places.
 *
 * What the bill has that the receipt does not is the **due date** and the
 * **transfer instructions** (NFR-1.1). What the receipt has that the bill
 * does not is a payment. Everything else is one document at two moments.
 *
 * Amounts are read off the stored bill, never recomputed (see `Bill`): the
 * tenant's copy has to stay reconstructable after a rate changes.
 */

export interface BillDocumentLine {
  label: string;
  /** Which month this charge is for, as the paper prints it. */
  detail: string;
  amount: number;
}

export interface BillDocument {
  bill: Bill;
  roomLabel: string;
  /** `b-004` — the bill's own id, the reference printed on the slip. */
  reference: string;
  lines: BillDocumentLine[];
  total: number;
  issuedOnLabel: string;
  dueOnLabel: string;
  /** 'ส.ค. 2569' — the utility month, the slip's own period field. */
  periodLabel: string;
  /** ค้าง as an admin wrote it, or null. Never inferred — see `Bill`. */
  arrearsNote: string | null;
  /**
   * What has been paid against this bill already, if anything.
   *
   * A bill is normally printed before any payment exists, so this is usually
   * a zero settlement. It is carried anyway because a **reprint** is the
   * common case that goes wrong: a tenant who paid an instalment and asks for
   * the bill again must not be handed a document that reads as though nothing
   * has been received.
   */
  settlement: Settlement;
  /** True when something has been paid but the bill is not cleared. */
  partlyPaid: boolean;
  /** True when the bill is settled — a reprint should not ask for money. */
  settled: boolean;
}

export function billDocumentFor(
  bill: Bill,
  room: Room | null,
  payments: Payment[],
): BillDocument {
  // The cycle is rebuilt from the bill's own id so the two month labels come
  // from the one place that owns that rule (KS-20), rather than from a second
  // reading of the issue date here. Same reasoning as `receiptFor`.
  const [year, month] = bill.cycle.split('-').map(Number);
  const cycle = cycleIssuedIn(year!, month! - 1);

  const settlement = settle(bill, payments);

  return {
    bill,
    roomLabel: room?.label ?? bill.roomId,
    reference: bill.id,
    // The same three lines the receipt prints, in the same order.
    lines: [
      { label: 'ค่าเช่าห้อง', detail: rentLabel(cycle), amount: bill.rentAmount },
      { label: 'ค่าไฟ', detail: utilityLabel(cycle), amount: bill.electricityAmount },
      { label: 'ค่าน้ำ', detail: utilityLabel(cycle), amount: bill.waterAmount },
    ],
    total: billTotal(bill),
    issuedOnLabel: formatThaiDate(bill.issueDate),
    dueOnLabel: formatThaiDate(bill.dueDate),
    periodLabel: formatThaiMonth(cycle.utilityMonth),
    arrearsNote: hasArrears(bill) ? bill.arrearsNote : null,
    settlement,
    partlyPaid: settlement.paid > 0 && settlement.outstanding > 0,
    settled: settlement.paid > 0 && settlement.outstanding <= 0,
  };
}
