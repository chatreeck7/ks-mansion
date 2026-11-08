import { describe, expect, it } from 'vitest';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import { makeBill, makeLease, makeMeterReading, makeRoom } from '@/lib/test-support/fixtures';
import {
  electricitySummaryFor,
  roomSummaryFor,
  shortMonthYear,
  shortThaiDate,
} from './month-summary';

const october = cycleIssuedIn(2026, 9);

const rooms = [
  makeRoom({ id: '101', label: '101', floor: 1, appliances: { tv: false, fridge: true, aircon: false } }),
  makeRoom({ id: 'laundry', label: 'ร้านซักผ้า', floor: 0, kind: 'common' }),
  makeRoom({ id: '201', label: '201', floor: 2 }),
  makeRoom({ id: '202', label: '202', floor: 2, status: 'available', hasMeter: true }),
];

describe('electricitySummaryFor', () => {
  const readings = [
    makeMeterReading({ id: 'm-1', roomId: '101', readDate: new Date(2026, 9, 27), previousReading: 12047, currentReading: 12102, ratePerUnit: 7 }),
    makeMeterReading({ id: 'm-2', roomId: 'laundry', readDate: new Date(2026, 9, 27), previousReading: 48861, currentReading: 48982, ratePerUnit: 6 }),
    makeMeterReading({ id: 'm-3', roomId: 'laundry', meterType: 'water', readDate: new Date(2026, 9, 27), previousReading: 8000, currentReading: 8024, ratePerUnit: 20 }),
    makeMeterReading({ id: 'm-4', roomId: '201', readDate: new Date(2026, 9, 27), previousReading: 7476, currentReading: 7514, ratePerUnit: 7 }),
    // Last month's figure for 201 and an archived correction: neither counts.
    makeMeterReading({ id: 'm-5', roomId: '201', readDate: new Date(2026, 8, 25), previousReading: 7400, currentReading: 7476, ratePerUnit: 7 }),
    makeMeterReading({ id: 'm-6', roomId: '201', readDate: new Date(2026, 9, 27), previousReading: 7476, currentReading: 9999, ratePerUnit: 7, archived: true }),
  ];
  const summary = electricitySummaryFor(october, rooms, readings);

  it('groups the ground floor with floor 1, as the paper does, and subtotals each floor', () => {
    expect(summary.floors.map((f) => f.floor)).toEqual([1, 2]);
    const [first, second] = summary.floors;
    expect(first!.rows.map((r) => r.label)).toEqual(['101', 'ร้านซักผ้า']);
    // 55×7 + 121×6 + 24×20 (the laundry's ค่าน้ำ line counts in รวมเงิน)
    expect(first!.subtotal).toBe(385 + 726 + 480);
    expect(second!.subtotal).toBe(38 * 7);
    expect(summary.total).toBe(385 + 726 + 480 + 266);
  });

  it('prints the laundry water dial beneath its electricity', () => {
    const laundry = summary.floors[0]!.rows[1]!;
    expect(laundry.water).toMatchObject({ previous: 8000, current: 8024, units: 24, amount: 480 });
  });

  it('names a metered room that was not read this round rather than skipping it', () => {
    expect(summary.unread).toEqual(['202']);
    expect(summary.floors[1]!.rows.find((r) => r.label === '202')!.electricity).toBeNull();
  });

  it('titles the sheet with the utility month', () => {
    expect(summary.title).toBe('สรุปรายการค่าไฟฟ้าห้องพัก เดือน ตุลาคม 2569');
  });
});

describe('roomSummaryFor', () => {
  const leases = [makeLease({ id: 'l-1', roomId: '101', startDate: new Date(2023, 2, 29) })];
  const bills = [
    makeBill({ id: 'b-1', roomId: '101', leaseId: 'l-1', cycle: '2026-10', rentAmount: 2200, waterAmount: 100, electricityAmount: 385, arrearsNote: 'ยอดค้าง 500' }),
    makeBill({ id: 'b-2', roomId: '201', leaseId: null, cycle: '2026-10', rentAmount: 2300, waterAmount: 200, electricityAmount: 266 }),
    makeBill({ id: 'b-3', roomId: '201', leaseId: null, cycle: '2026-09', rentAmount: 9999 }),
  ];
  const summary = roomSummaryFor(october, rooms, leases, bills);

  it('titles both months the way the family writes them', () => {
    expect(summary.title).toBe('สรุปรายการค่าห้องพัก ณ สิ้นเดือน ต.ค.69');
    expect(summary.subtitle).toBe('เก็บค่าเช่าของ พ.ย.69, ค่าน้ำค่าไฟของ ต.ค.69');
  });

  it('reads this cycle’s bills only and totals each floor', () => {
    const [first, second] = summary.floors;
    expect(first!.totals).toMatchObject({ rent: 2200, water: 100, electricity: 385, total: 2685, billed: 1 });
    expect(second!.totals).toMatchObject({ rent: 2300, total: 2766, billed: 1 });
    expect(summary.totals.total).toBe(2685 + 2766);
  });

  it('keeps unbilled rooms on the sheet with their status, and the arrears note', () => {
    const row101 = summary.floors[0]!.rows[0]!;
    expect(row101.note).toBe('ยอดค้าง 500');
    expect(row101.movedIn).toEqual(new Date(2023, 2, 29));
    const row202 = summary.floors[1]!.rows.find((r) => r.label === '202')!;
    expect(row202).toMatchObject({ total: null, note: 'ว่าง' });
    expect(summary.vacant).toBe(1);
  });

  it('counts the landlord’s appliances', () => {
    expect(summary.floors[0]!.rows[0]).toMatchObject({ tv: false, fridge: true, aircon: false });
    expect(summary.totals.fridge).toBe(1);
  });
});

describe('short dates', () => {
  it('writes dates and months as the register does', () => {
    expect(shortThaiDate(new Date(2026, 9, 27))).toBe('27/10/69');
    expect(shortMonthYear(new Date(2026, 10, 1))).toBe('พ.ย.69');
  });
});
