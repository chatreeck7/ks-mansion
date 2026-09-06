import { describe, expect, it } from 'vitest';
import { makeBill, makePayment, makeRoom } from '@/lib/test-support/fixtures';
import { receiptFor, receiptPeriodLabel } from './receipt';

/** Room 101, cycle 2025-03: 2,200 + 336 + 100 = 2,636. */
const BILL = makeBill({ id: 'b-001', roomId: '101', cycle: '2025-03' });
const ROOM = makeRoom({ id: '101', label: '101' });

describe('receiptFor', () => {
  const payment = makePayment({ id: 'p-007', billId: 'b-001', amount: 2636 });
  const receipt = receiptFor(payment, BILL, ROOM, [payment]);

  /**
   * The four-line shape of ใบแจ้งค่าห้องพัก, which is the document that
   * actually serves as the receipt once ผู้รับเงิน has signed it.
   */
  it('prints the bill lines in the order the paper prints them', () => {
    expect(receipt.lines.map((line) => line.label)).toEqual(['ค่าเช่าห้อง', 'ค่าไฟ', 'ค่าน้ำ']);
    expect(receipt.lines.map((line) => line.amount)).toEqual([2200, 336, 100]);
    expect(receipt.billTotal).toBe(2636);
  });

  /**
   * The thing a bill points two ways about (KS-20): rent is next month's,
   * utilities are this month's. A receipt that named one month for both would
   * be wrong about one of them.
   */
  it('names the month each line is for, and they are not the same month', () => {
    expect(receipt.lines[0]!.detail).toContain('เม.ย.');
    expect(receipt.lines[1]!.detail).toContain('มี.ค.');
  });

  it('says what arrived, when, and how', () => {
    expect(receipt.paidOnLabel).toBe('26 มี.ค. 2568');
    expect(receipt.methodLabel).toBe('โอน');
    expect(receipt.payment.amount).toBe(2636);
  });

  it('uses the payment id as its reference, inventing no numbering scheme', () => {
    expect(receipt.reference).toBe('p-007');
  });

  it('reads paid in full when it is', () => {
    expect(receipt.partial).toBe(false);
    expect(receipt.standingLabel).toBe('จ่ายครบ');
  });

  /**
   * An instalment receipt has to say so on its face. Handing someone who paid
   * 2,000 of 2,636 a slip that reads like a clean settlement is the one way
   * this document can actively mislead.
   */
  it('says what is still outstanding after a part payment', () => {
    const instalment = makePayment({ id: 'p-008', billId: 'b-001', amount: 2000 });
    const partial = receiptFor(instalment, BILL, ROOM, [instalment]);

    expect(partial.partial).toBe(true);
    expect(partial.standingLabel).toBe('ยังค้างอีก 636 บาท');
  });

  /** The bill's *other* payments count, or the second slip repeats the first. */
  it('counts every payment on the bill, not only the one being printed', () => {
    const first = makePayment({ id: 'p-008', billId: 'b-001', amount: 2000 });
    const second = makePayment({ id: 'p-009', billId: 'b-001', amount: 636 });
    const receipt = receiptFor(second, BILL, ROOM, [first, second]);

    expect(receipt.settlement.paid).toBe(2636);
    expect(receipt.standingLabel).toBe('จ่ายครบ');
  });

  it('says so when more arrived than this bill asked for', () => {
    const clearing = makePayment({ id: 'p-010', billId: 'b-001', amount: 6963 });
    const receipt = receiptFor(clearing, BILL, ROOM, [clearing]);

    expect(receipt.standingLabel).toBe('รับเกินยอดบิล 4,327 บาท');
  });

  it('falls back to the room id when the room is gone', () => {
    expect(receiptFor(payment, BILL, null, [payment]).roomLabel).toBe('101');
  });
});

describe('receiptPeriodLabel', () => {
  it('names the month the slip is headed with', () => {
    expect(receiptPeriodLabel(BILL)).toBe('มี.ค. 2568');
  });
});
