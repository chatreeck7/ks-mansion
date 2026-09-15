import { describe, expect, it } from 'vitest';
import { makeBill, makePayment, makeRoom } from '@/lib/test-support/fixtures';
import { receiptFor } from './receipt';
import { billDocumentFor } from './bill-document';

const ROOM = makeRoom({ id: '101', label: '101', floor: 1 });
const BILL = makeBill();

describe('billDocumentFor', () => {
  it('prints the three charges in the order the paper prints them', () => {
    const doc = billDocumentFor(BILL, ROOM, []);

    expect(doc.lines).toEqual([
      { label: 'ค่าเช่าห้อง', detail: 'ค่าเช่าเดือน เม.ย. 2568', amount: 2200 },
      { label: 'ค่าไฟ', detail: 'ค่าน้ำค่าไฟเดือน มี.ค. 2568', amount: 336 },
      { label: 'ค่าน้ำ', detail: 'ค่าน้ำค่าไฟเดือน มี.ค. 2568', amount: 100 },
    ]);
    expect(doc.total).toBe(2636);
  });

  /**
   * The bill and the receipt are one slip at two moments — KS-23's finding.
   * A tenant comparing the copy they were given with the one they signed has
   * to find the same figures under the same labels, so the two are pinned
   * against each other rather than each against a literal.
   */
  it('agrees line for line with the receipt built from the same bill', () => {
    const payment = makePayment({ billId: BILL.id });
    const doc = billDocumentFor(BILL, ROOM, [payment]);
    const receipt = receiptFor(payment, BILL, ROOM, [payment]);

    expect(doc.lines).toEqual(receipt.lines);
    expect(doc.total).toBe(receipt.billTotal);
    expect(doc.roomLabel).toBe(receipt.roomLabel);
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
