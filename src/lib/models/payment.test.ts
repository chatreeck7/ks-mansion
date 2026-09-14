import { describe, expect, it } from 'vitest';
import { makeBill, makePayment } from '@/lib/test-support/fixtures';
import { paymentMethodLabel, settle, settlementLabel } from './payment';

/** 2,200 + 336 + 100 = 2,636 — the reconciliation from ใบแจ้งค่าห้องพัก. */
const BILL = makeBill({ id: 'b-001', rentAmount: 2200, electricityAmount: 336, waterAmount: 100 });

describe('settle', () => {
  it('reads unpaid when nothing has arrived', () => {
    expect(settle(BILL, [])).toMatchObject({ due: 2636, paid: 0, outstanding: 2636, state: 'unpaid' });
  });

  it('reads paid when the exact amount arrived', () => {
    const paid = settle(BILL, [makePayment({ billId: 'b-001', amount: 2636 })]);
    expect(paid).toMatchObject({ paid: 2636, outstanding: 0, state: 'paid' });
  });

  /**
   * แบ่งจ่าย — the owner's own correction on KS-13: a split figure in the
   * register is an instalment, not a half-month charge. So one bill takes
   * many payments and they add up.
   */
  it('adds instalments together and reads partial until they cover the bill', () => {
    const first = makePayment({ id: 'p-001', billId: 'b-001', amount: 2000 });
    const second = makePayment({ id: 'p-002', billId: 'b-001', amount: 636 });

    expect(settle(BILL, [first])).toMatchObject({ paid: 2000, outstanding: 636, state: 'partial' });
    expect(settle(BILL, [first, second])).toMatchObject({ paid: 2636, state: 'paid' });
  });

  /**
   * Room 306 of the real collection form: billed 3,900 with `ยอดค้าง 4,327`
   * beside it. One transfer clears both, and it has to be recordable.
   */
  it('accepts more than the bill asked for, because arrears are cleared in the same transfer', () => {
    const settled = settle(BILL, [makePayment({ billId: 'b-001', amount: 6963 })]);

    expect(settled).toMatchObject({ outstanding: -4327, state: 'overpaid' });
  });

  it('ignores a payment against another bill', () => {
    expect(settle(BILL, [makePayment({ billId: 'b-002', amount: 2636 })]).paid).toBe(0);
  });

  /** A voided receipt is money that never arrived — it cannot still settle. */
  it('ignores an archived payment', () => {
    const voided = makePayment({ billId: 'b-001', amount: 2636, archived: true });

    expect(settle(BILL, [voided])).toMatchObject({ paid: 0, state: 'unpaid' });
  });

  it('lists the payments oldest first, whatever order they were handed in', () => {
    const later = makePayment({ id: 'p-002', billId: 'b-001', amount: 636, paidOn: new Date(2025, 3, 5) });
    const earlier = makePayment({ id: 'p-001', billId: 'b-001', amount: 2000, paidOn: new Date(2025, 2, 28) });

    expect(settle(BILL, [later, earlier]).payments.map((p) => p.id)).toEqual(['p-001', 'p-002']);
  });

  /** ค้าง is an admin's sentence (KS-22), and no part of this arithmetic. */
  it('takes no notice of the arrears note on the bill', () => {
    const annotated = makeBill({ ...BILL, arrearsNote: 'ยอดค้าง 4,327' });

    expect(settle(annotated, []).due).toBe(settle(BILL, []).due);
  });
});

describe('labels', () => {
  it('names the two ways money arrives', () => {
    expect(paymentMethodLabel('transfer')).toBe('โอน');
    expect(paymentMethodLabel('cash')).toBe('เงินสด');
  });

  it('names every settlement state', () => {
    for (const state of ['unpaid', 'partial', 'paid', 'overpaid'] as const) {
      expect(settlementLabel(state)).not.toBe('');
    }
  });
});
