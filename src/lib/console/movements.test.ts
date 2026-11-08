import { describe, expect, it } from 'vitest';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import { makeLease, makeRoom, makeTenant } from '@/lib/test-support/fixtures';
import { movementPeriodFor, movementRegisterFor, stayLabel } from './movements';

const october = cycleIssuedIn(2026, 9);
const period = movementPeriodFor(october);

const rooms = [
  makeRoom({ id: '101', label: '101' }),
  makeRoom({ id: '204', label: '204', floor: 2 }),
  makeRoom({ id: '206', label: '206', floor: 2, status: 'noticeGiven' }),
  makeRoom({ id: '305', label: '305', floor: 3, status: 'available' }),
  makeRoom({ id: 'laundry', label: 'ร้านซักผ้า', floor: 0, kind: 'common' }),
];
const tenants = [
  makeTenant({ id: 't-1', fullName: 'ก', nickname: '' }),
  makeTenant({ id: 't-2', fullName: 'ข', nickname: '' }),
  makeTenant({ id: 't-3', fullName: 'ค', nickname: '' }),
  makeTenant({ id: 't-4', fullName: 'ง', nickname: '' }),
];
const leases = [
  // Moved from 101 to 204 inside the period.
  makeLease({ id: 'l-1', roomId: '101', tenantId: 't-1', startDate: new Date(2025, 3, 1), endDate: new Date(2026, 9, 5), endReason: 'normal' }),
  makeLease({ id: 'l-2', roomId: '204', tenantId: 't-1', startDate: new Date(2026, 9, 6), previousLeaseId: 'l-1', moveInDue: 0, moveInPaid: 0 }),
  // New tenant in 101, paid part of the move-in money.
  makeLease({ id: 'l-3', roomId: '101', tenantId: 't-2', startDate: new Date(2026, 9, 20), rentRate: 2500, deposit: 2000, advanceRent: 2500, moveInDue: 4500, moveInPaid: 4000 }),
  // Absconded from 305, owing after the deposit.
  makeLease({ id: 'l-4', roomId: '305', tenantId: 't-3', startDate: new Date(2026, 1, 1), endDate: new Date(2026, 9, 15), endReason: 'absconded', moveOutDue: 578, moveOutPaid: null }),
  makeLease({ id: 'l-5', roomId: '206', tenantId: 't-4', startDate: new Date(2026, 4, 1), endDate: new Date(2026, 10, 30) }),
];
const register = movementRegisterFor(period, rooms, leases, tenants);

describe('movementPeriodFor', () => {
  it('runs from the day after last cycle’s issue to this one’s', () => {
    expect(period.from).toEqual(new Date(2026, 8, 27));
    expect(period.to).toEqual(new Date(2026, 9, 26));
  });
});

describe('movementRegisterFor', () => {
  it('lists move-ins in date order, with what is still owed and transfers named', () => {
    expect(register.moveIns.map((row) => [row.roomLabel, row.tenant, row.outstanding, row.transferFrom])).toEqual([
      ['204', 'ก', 0, 'ย้ายมาจากห้อง 101'],
      ['101', 'ข', 500, null],
    ]);
  });

  it('lists move-outs with the stay counted from the first room and the deposit in words', () => {
    expect(register.moveOuts).toEqual([
      expect.objectContaining({ roomLabel: '101', reason: 'ย้ายไปห้อง 204', stayed: '1 ปี 6 เดือน' }),
      expect.objectContaining({ roomLabel: '305', reason: 'หนี', absconded: true, settlement: 'เก็บเพิ่ม 578', stayed: '8 เดือน' }),
    ]);
  });

  it('shows vacant units as of the period end, and who has given notice', () => {
    expect(register.vacant).toEqual([{ roomLabel: '305', since: new Date(2026, 9, 16) }]);
    expect(register.leaving).toEqual([{ roomLabel: '206', until: new Date(2026, 10, 30) }]);
  });
});

describe('stayLabel', () => {
  it('reads as years and months', () => {
    expect(stayLabel(new Date(2026, 0, 10), new Date(2026, 0, 30))).toBe('ไม่ถึงเดือน');
    expect(stayLabel(new Date(2024, 0, 1), new Date(2026, 0, 1))).toBe('2 ปี');
  });
});
