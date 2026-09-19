  /**
   * The bill and the receipt are one slip at two moments — KS-23's finding.
   * A tenant comparing the copy they were given with the one they signed has
   * to find the same charges under the same labels, so the two are pinned
   * against each other rather than each against a literal.
   *
   * The receipt prints three lines and the bill four: อื่นๆ is a place to
   * write in, and there is nothing to write once the money has arrived.
   */
  it('charges the same amounts under the same labels as the receipt', () => {
    const payment = makePayment({ billId: BILL.id });
    const doc = billDocumentFor(BILL, ROOM, [payment]);
    const receipt = receiptFor(payment, BILL, ROOM, [payment]);

    const charged = doc.rows.filter((row) => row.amount !== null);
    expect(charged.map((row) => [row.label, row.amount])).toEqual(
      receipt.lines.map((line) => [line.label, line.amount]),
    );
    expect(doc.total).toBe(receipt.billTotal);
    expect(doc.roomLabel).toBe(receipt.roomLabel);
  });

import { describe, expect, it } from 'vitest';
import { makeBill, makePayment, makeRoom } from '@/lib/test-support/fixtures';
import { receiptFor } from './receipt';
import { billDocumentFor } from './bill-document';

const ROOM = makeRoom({ id: '101', label: '101', floor: 1 });
const BILL = makeBill();

describe('billDocumentFor', () => {
  /**
   * The acceptance data is the real slip for room 101 in
   * `สำเนาของ ใบเสร็จ หอพัก.xlsx`: ค่าเช่า 2,200, ค่าไฟ 11900 - 11948 =
   * 48 หน่วย × 7 = 336, ค่าน้ำ 100, อื่นๆ blank, total 2,636.
   */
  it('reproduces the paper slip row for row, working included', () => {
    const doc = billDocumentFor(BILL, ROOM, []);

    expect(doc.rows).toEqual([
      { label: 'ค่าเช่าห้อง', meterRange: null, quantity: 1, rate: null, amount: 2200 },
      { label: 'ค่าไฟ', meterRange: '11900 - 11948', quantity: 48, rate: 7, amount: 336 },
      { label: 'ค่าน้ำ', meterRange: null, quantity: 1, rate: 100, amount: 100 },
      { label: 'อื่นๆ', meterRange: null, quantity: null, rate: null, amount: null },
    ]);
    expect(doc.total).toBe(2636);
  });

  /**
   * อื่นๆ is on every printed bill, nearly always blank — it is where a
   * one-off is written by hand. Dropping it would make the console's slip a
   * row shorter than the one it replaces.
   */
  it('always prints อื่นๆ, even with nothing in it', () => {
    expect(billDocumentFor(BILL, ROOM, []).rows.at(-1)).toMatchObject({
      label: 'อื่นๆ',
      amount: null,
    });
  });

  it('spells the month out, as the slip heads itself', () => {
    expect(billDocumentFor(BILL, ROOM, []).periodLabel).toBe('มีนาคม');
  });

  /**
   * The rate is divided out of the amount rather than stored beside it, so
   * the printed rate can never fail to multiply out to the total next to it
   * — the one arithmetic a tenant checks by hand.
   */
  it('derives a rate that multiplies back to the amount', () => {
    const doc = billDocumentFor(BILL, ROOM, []);
    const electricity = doc.rows[1]!;
    expect(electricity.quantity! * electricity.rate!).toBe(electricity.amount);
  });

  describe('a bill with no working recorded', () => {
    // Every bill issued before these columns existed, and any room whose
    // meter was never read.
    const bare = makeBill({
      electricityPrevious: null,
      electricityCurrent: null,
      waterQuantity: null,
    });

    it('prints the amount and leaves the working blank rather than inventing it', () => {
      const doc = billDocumentFor(bare, ROOM, []);

      expect(doc.rows[1]).toEqual({
        label: 'ค่าไฟ',
        meterRange: null,
        quantity: null,
        rate: null,
        amount: 336,
      });
      expect(doc.total).toBe(2636);
    });
  });

  it('shows no rate for a meter that did not move, rather than dividing by zero', () => {
    const still = makeBill({
      electricityPrevious: 11948,
      electricityCurrent: 11948,
      electricityAmount: 0,
    });
    const doc = billDocumentFor(still, ROOM, []);

    expect(doc.rows[1]).toMatchObject({ quantity: 0, rate: null, amount: 0 });
  });

  it('carries the due date, which is what the bill has and the receipt does not', () => {
    expect(billDocumentFor(BILL, ROOM, []).dueOnLabel).toBe('10 เม.ย. 2568');
    expect(billDocumentFor(BILL, ROOM, []).issuedOnLabel).toBe('26 มี.ค. 2568');
  });

  it('falls back to the room id when the registry has no room', () => {
    expect(billDocumentFor(BILL, null, []).roomLabel).toBe('101');
  });

  it('prints ค้าง as the sentence an admin wrote, and keeps it out of the total', () => {
    const annotated = makeBill({ arrearsNote: 'ยอดค้าง 4,327' });
    const doc = billDocumentFor(annotated, ROOM, []);

    expect(doc.arrearsNote).toBe('ยอดค้าง 4,327');
    expect(doc.total).toBe(2636);
  });

  it('treats a blank note as no note', () => {
    expect(billDocumentFor(makeBill({ arrearsNote: '  ' }), ROOM, []).arrearsNote).toBeNull();
  });

  describe('a reprint, which is where this goes wrong', () => {
    it('says nothing about payment on the ordinary first print', () => {
      const doc = billDocumentFor(BILL, ROOM, []);
      expect(doc.partlyPaid).toBe(false);
      expect(doc.settled).toBe(false);
      expect(doc.settlement.paid).toBe(0);
    });

    it('does not ask again for money already received', () => {
      const doc = billDocumentFor(BILL, ROOM, [
        makePayment({ id: 'p-1', billId: BILL.id, amount: 2000 }),
      ]);

      expect(doc.partlyPaid).toBe(true);
      expect(doc.settlement.outstanding).toBe(636);
    });

    it('marks a cleared bill as a copy rather than a demand', () => {
      const doc = billDocumentFor(BILL, ROOM, [
        makePayment({ id: 'p-1', billId: BILL.id, amount: 2636 }),
      ]);

      expect(doc.settled).toBe(true);
      expect(doc.partlyPaid).toBe(false);
    });

    it('ignores a payment against a different bill', () => {
      const doc = billDocumentFor(BILL, ROOM, [
        makePayment({ id: 'p-1', billId: 'b-999', amount: 2636 }),
      ]);

      expect(doc.settlement.paid).toBe(0);
    });
  });
});
