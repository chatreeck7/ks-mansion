import { describe, expect, it } from 'vitest';
import { cycleIssuedIn } from './billing-cycle';
import { makeLease } from '@/lib/test-support/fixtures';
import { firstBillCycle, firstBillSummary, rentForCycle } from './move-in';

const OCT = cycleIssuedIn(2026, 9);
const NOV = cycleIssuedIn(2026, 10);
const DEC = cycleIssuedIn(2026, 11);

describe('rentForCycle', () => {
  it('bills nothing before the agreed billing start (in 30 ต.ค., billed from 1 พ.ย.)', () => {
    const lease = makeLease({ startDate: new Date(2026, 9, 30), billingStartDate: new Date(2026, 10, 1), rentRate: 3000, advanceRent: 3000 });
    expect(rentForCycle(lease, OCT)).toMatchObject({ billing: false, rentAmount: 0, basis: 'เริ่มคิดเงิน 1 พ.ย. 2569' });
    // First bill: November's rent was the advance; December's is charged.
    expect(rentForCycle(lease, NOV)).toMatchObject({ billing: true, rentAmount: 3000, basis: 'ค่าเช่า พ.ย. 2569 จ่ายล่วงหน้าแล้ว' });
    expect(rentForCycle(lease, DEC)).toMatchObject({ rentAmount: 3000, basis: null });
  });

  it('charges the part month at the agreed daily rate (in 30 ต.ค., 2 วัน × 100)', () => {
    const lease = makeLease({ startDate: new Date(2026, 9, 30), rentRate: 3000, advanceRent: 3000, proratePerDay: 100 });
    // Billing starts 30 ต.ค., after the ต.ค. bill went out → first bill is พ.ย.
    expect(firstBillCycle(lease).id).toBe('2026-11');
    expect(rentForCycle(lease, NOV)).toMatchObject({
      rentAmount: 3200,
      partialDays: 2,
      partialAmount: 200,
      basis: 'ค่าเช่า พ.ย. 2569 จ่ายล่วงหน้าแล้ว · เศษเดือน 2 วัน × 100 = 200',
    });
  });

  it('room 206: in 24 ต.ค. with advance, no daily rate → nothing on the ต.ค. bill', () => {
    const lease = makeLease({ startDate: new Date(2026, 9, 24), rentRate: 3000, advanceRent: 3000 });
    expect(rentForCycle(lease, OCT)).toMatchObject({
      rentAmount: 0,
      basis: 'ค่าเช่า พ.ย. 2569 จ่ายล่วงหน้าแล้ว · เศษเดือน 8 วัน ไม่คิด',
    });
  });

  it('charges the rate when no advance was taken', () => {
    const lease = makeLease({ startDate: new Date(2026, 10, 1), rentRate: 2500, advanceRent: 0 });
    expect(rentForCycle(lease, NOV)).toMatchObject({ rentAmount: 2500 });
  });
});

describe('firstBillSummary', () => {
  it('says when the first bill goes out and what it charges', () => {
    const lease = makeLease({
      startDate: new Date(2026, 9, 30), rentRate: 3000, advanceRent: 3000, proratePerDay: 100, startMeter: 9468,
    });
    expect(firstBillSummary(lease)).toBe(
      'บิลแรกออก 26 พ.ย. 2569 · ค่าเช่า ธ.ค. 2569 3,000 · ค่าเช่า พ.ย. 2569 จ่ายล่วงหน้าแล้ว · เศษเดือน 2 วัน × 100 = 200 · ค่าไฟคิดจากมิเตอร์ 9,468',
    );
  });
});
