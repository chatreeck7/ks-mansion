import {
  billElectricityRate,
  billElectricityUnits,
  billTotal,
  billWaterRate,
  hasArrears,
  type Bill,
} from '@/lib/models/bill';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import { settle, type Payment, type Settlement } from '@/lib/models/payment';
import type { Room } from '@/lib/models/room';
import { formatThaiDate, formatThaiMonthName } from '@/lib/format/thai';

/**
 * ใบแจ้งค่าห้องพัก — the bill as the building's own document (KS-24).
 *
 * **Laid out from the real slip in `สำเนาของ ใบเสร็จ หอพัก.xlsx`, not from
 * what a bill "should" contain.** Its table is four fixed rows —
 * ค่าเช่าห้อง, ค่าไฟ, ค่าน้ำ, อื่นๆ — under `รายการ / Description`,
 * `จำนวน / Quantity`, `ราคา / Amount`, with the electricity dial range
 * written inline beside the label (`11900 - 13948`) and its per-unit rate in
 * its own narrow column. อื่นๆ is on every printed bill whether or not it
 * carries anything, so it is here too: a tenant used to four rows should not
 * have to wonder which one was dropped.
 *
 * The first version of this file printed only label, month and amount. That
 * is a summary of the bill, not the bill — the working *is* the document, and
 * it is the line a tenant queries.
 *
 * Every figure comes off the stored bill and none is recomputed from today's
 * readings: a bill handed over is history (see `Bill`).
 */

export interface BillDocumentRow {
  label: string;
  /** `11,900 - 11,948` on the electricity row; null on the others. */
  meterRange: string | null;
  /** Units, occupants, or 1 for rent. Null where the row counts nothing. */
  quantity: number | null;
  /** บาท per unit, shown only where a rate was charged. */
  rate: number | null;
  /** Null on อื่นๆ, which prints as an empty row unless something is owed. */
  amount: number | null;
}

export interface BillDocument {
  bill: Bill;
  roomLabel: string;
  /** `b-004` — the bill's own id, the reference printed on the slip. */
  reference: string;
  /** The four rows, always in this order. */
  rows: BillDocumentRow[];
  total: number;
  issuedOnLabel: string;
  dueOnLabel: string;
  /** 'สิงหาคม' — spelled out, as the slip's ยอดชำระเดือน field is. */
  periodLabel: string;
  /** ค้าง as an admin wrote it, or null. Never inferred — see `Bill`. */
  arrearsNote: string | null;
  /**
   * What has been paid against this bill already, if anything.
   *
   * A bill is normally printed before any payment exists. It is carried
   * because a **reprint** is the case that goes wrong: a tenant who paid an
   * instalment and asks for the bill again must not be handed a document
   * reading as though nothing arrived.
   */
  settlement: Settlement;
  partlyPaid: boolean;
  settled: boolean;
}

/** `1,677 - 1,800`, the dial range the slip writes beside ค่าไฟ. */
function meterRangeOf(bill: Bill): string | null {
  if (bill.electricityPrevious === null || bill.electricityCurrent === null) return null;
  return `${bill.electricityPrevious} - ${bill.electricityCurrent}`;
}

export function billDocumentFor(
  bill: Bill,
  room: Room | null,
  payments: Payment[],
): BillDocument {
  // The cycle is rebuilt from the bill's own id so the month labels come from
  // the one place that owns that rule (KS-20). Same as `receiptFor`.
  const [year, month] = bill.cycle.split('-').map(Number);
  const cycle = cycleIssuedIn(year!, month! - 1);

  const settlement = settle(bill, payments);

  const rows: BillDocumentRow[] = [
    // Rent is one month of it — the slip writes 1 in จำนวน, not the rate.
    { label: 'ค่าเช่าห้อง', meterRange: null, quantity: 1, rate: null, amount: bill.rentAmount },
    {
      label: 'ค่าไฟ',
      meterRange: meterRangeOf(bill),
      quantity: billElectricityUnits(bill),
      rate: billElectricityRate(bill),
      amount: bill.electricityAmount,
    },
    {
      label: 'ค่าน้ำ',
      meterRange: null,
      quantity: bill.waterQuantity,
      rate: billWaterRate(bill),
      amount: bill.waterAmount,
    },
    /**
     * อื่นๆ prints on every real bill and is nearly always blank — it is
     * where a one-off is written by hand. The console has nothing to put in
     * it, and leaving the row out would make the printed slip a row shorter
     * than the one it replaces.
     */
    { label: 'อื่นๆ', meterRange: null, quantity: null, rate: null, amount: null },
  ];

  return {
    bill,
    roomLabel: room?.label ?? bill.roomId,
    reference: bill.id,
    rows,
    total: billTotal(bill),
    issuedOnLabel: formatThaiDate(bill.issueDate),
    dueOnLabel: formatThaiDate(bill.dueDate),
    periodLabel: formatThaiMonthName(cycle.utilityMonth),
    arrearsNote: hasArrears(bill) ? bill.arrearsNote : null,
    settlement,
    partlyPaid: settlement.paid > 0 && settlement.outstanding > 0,
    settled: settlement.paid > 0 && settlement.outstanding <= 0,
  };
}
