import { describe, expect, it } from 'vitest';
import { makeBill, makeLease, makePayment, makeRoom, makeTenant } from '@/lib/test-support/fixtures';
import { buildingTiles, floorsOf, matchesFilter, tileCounts } from './building';

const TODAY = new Date(2025, 3, 3);

const tiles = buildingTiles({
  rooms: [
    makeRoom({ id: '101', label: '101', floor: 1 }),
    makeRoom({ id: '102', label: '102', floor: 1 }),
    makeRoom({ id: '103', label: '103', floor: 1 }),
    makeRoom({ id: '104', label: '104', floor: 1, status: 'maintenance' }),
    makeRoom({ id: '105', label: '105', floor: 1, status: 'available' }),
    makeRoom({ id: '201', label: '201', floor: 2 }),
    makeRoom({ id: 'laundry', label: 'ร้านซักผ้า', floor: 0, kind: 'common', status: 'available' }),
  ],
  leases: [
    makeLease({ id: 'l-101', roomId: '101', tenantId: 't-1' }),
    makeLease({ id: 'l-102', roomId: '102', tenantId: 't-2' }),
    makeLease({ id: 'l-201', roomId: '201', tenantId: 't-3' }),
  ],
  tenants: [
    makeTenant({ id: 't-1', fullName: 'สมชาย ใจดี', nickname: '' }),
    makeTenant({ id: 't-2', nickname: 'ต่าย' }),
    makeTenant({ id: 't-3', nickname: 'นิด' }),
  ],
  bills: [
    makeBill({ id: 'b-101', roomId: '101' }),
    makeBill({ id: 'b-102', roomId: '102' }),
  ],
  payments: [makePayment({ billId: 'b-101', amount: 2636 })],
  today: TODAY,
});

const byId = (id: string) => tiles.find((t) => t.id === id)!;

describe('buildingTiles', () => {
  it('reads the bill first: paid, then billed-and-waiting', () => {
    expect(byId('101').state).toBe('paid');
    expect(byId('101').mark).toBe('done');
    expect(byId('102').state).toBe('unpaid');
  });

  it('marks a lived-in room with no lease as missing data', () => {
    expect(byId('103').state).toBe('missing');
    expect(byId('103').mark).toBe('missing');
  });

  it('tells repair, vacancy and common space apart', () => {
    expect(byId('104').state).toBe('reno');
    expect(byId('105').state).toBe('vacant');
    expect(byId('laundry').state).toBe('common');
  });

  it('shows a nickname, or the first word of the name', () => {
    expect(byId('101').shortName).toBe('สมชาย');
    expect(byId('102').shortName).toBe('ต่าย');
  });

  it('a leased room with no bill yet is waiting for the bill run', () => {
    expect(byId('201').state).toBe('unbilled');
  });

  it('stacks floors top-down with ground-level spaces last', () => {
    expect(floorsOf(tiles).map((f) => f.label)).toEqual(['ชั้น 2', 'ชั้น 1', 'ชั้นล่าง']);
  });

  it('filters highlight a subset and count it', () => {
    expect(matchesFilter(byId('102'), 'unpaid')).toBe(true);
    expect(matchesFilter(byId('101'), 'unpaid')).toBe(false);
    expect(tileCounts(tiles)).toMatchObject({ all: 7, paid: 1, missing: 1, idle: 3 });
  });
});
