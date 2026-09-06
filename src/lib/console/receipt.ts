import { formatBaht, formatThaiDate, formatThaiMonth } from '@/lib/format/thai';
import type { Bill } from '@/lib/models/bill';
import { cycleIssuedIn, rentLabel, utilityLabel } from '@/lib/models/billing-cycle';
import {
  paymentMethodLabel,
  settle,
  settlementLabel,
  type Payment,
  type Settlement,
} from '@/lib/models/payment';
import type { Room } from '@/lib/models/room';

/**
 * ใบเสร็จ — the receipt for one payment (KS-23).
 *
 * **The building has no receipt document today, and that is a finding rather
 * than a gap in the research.** `สำเนาของ ใบเสร็จ หอพัก.xlsx` is named for
 * one but contains none: what it holds is ใบแจ้งค่าห้องพัก, the *bill*, whose
 * footer carries `ผู้รับเงิน` and `ผู้ชำระเงิน` signature lines. In practice
 * the bill slip, signed by whoever took the money, **is** the receipt.
 *
 * So this is that slip with the payment on it, not a new document invented
 * for the console: the same four charge lines in the same order, plus what
 * arrived, when, and how. The signature block is kept and left blank, because
 * that is what makes the paper a receipt and the console has no signature to
 * put there.
 *
 * **There is no receipt number.** The building has never had a numbering
 * scheme, so inventing `RE-2569-0001` would be inventing data — the standing
 * rule on this project. The payment's own id is the reference; a real series
 * can become a column on `payments` the day someone decides what it looks
 * like.
 */

export interface ReceiptLine {
  label: string;
  /** How the figure was arrived at, where the paper prints working. */
  detail: string;
  amount: number;
}

export interface Receipt {
  payment: Payment;
  bill: Bill;
  roomLabel: string;
  /** `p-014` — the reference printed on the slip. See above. */
  reference: string;
  /** What the bill charged, in the order ใบแจ้งค่าห้องพัก prints them. */
  lines: ReceiptLine[];
  billTotal: number;
  paidOnLabel: string;
  methodLabel: string;
  /** Where this bill stands *including* this payment. */
  settlement: Settlement;
  /** One sentence for the slip: paid in full, part paid, or over. */
  standingLabel: string;
  /** True when this payment did not clear the bill on its own. */
  partial: boolean;
}

/**
 * Builds the receipt for a payment.
 *
 * Takes every payment against the bill, not only this one, so the slip can
 * say what is still outstanding after an instalment. A receipt that showed
 * only its own amount would be handed to a tenant who paid 2,000 of 2,636
 * and read as though they were square.
 */
export function receiptFor(
  payment: Payment,
  bill: Bill,
  room: Room | null,
  allPayments: Payment[],
): Receipt {
  // The bill's own cycle, rebuilt from its id, so the two month labels on the
  // slip come from the one place that owns that rule (KS-20) rather than from
  // a second reading of the issue date here.
  const [year, month] = bill.cycle.split('-').map(Number);
  const cycle = cycleIssuedIn(year!, month! - 1);

  const settlement = settle(bill, allPayments);

  const lines: ReceiptLine[] = [
    { label: 'ค่าเช่าห้อง', detail: rentLabel(cycle), amount: bill.rentAmount },
    { label: 'ค่าไฟ', detail: utilityLabel(cycle), amount: bill.electricityAmount },
    { label: 'ค่าน้ำ', detail: utilityLabel(cycle), amount: bill.waterAmount },
  ];

  return {
    payment,
    bill,
    roomLabel: room?.label ?? bill.roomId,
    reference: payment.id,
    lines,
    billTotal: settlement.due,
    paidOnLabel: formatThaiDate(payment.paidOn),
    methodLabel: paymentMethodLabel(payment.method),
    settlement,
    standingLabel: standingFor(settlement),
    partial: settlement.outstanding > 0,
  };
}

function standingFor(settlement: Settlement): string {
  if (settlement.outstanding > 0) {
    return `ยังค้างอีก ${formatBaht(settlement.outstanding)} บาท`;
  }
  if (settlement.outstanding < 0) {
    return `รับเกินยอดบิล ${formatBaht(-settlement.outstanding)} บาท`;
  }
  return settlementLabel('paid');
}

/** 'ยอดชำระเดือน สิงหาคม' — the slip's own header field, from the cycle. */
export function receiptPeriodLabel(bill: Bill): string {
  const [year, month] = bill.cycle.split('-').map(Number);
  return formatThaiMonth(cycleIssuedIn(year!, month! - 1).utilityMonth);
}
