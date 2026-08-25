import { describe, expect, it } from 'vitest';
import { isUnit } from '@/lib/models/room';
import { makeRoom } from '@/lib/test-support/fixtures';
import { createMemoryRoomRepository, SEED_ROOMS } from './memory-room-repository';

describe('SEED_ROOMS', () => {
  it('holds the full registry: 5 + 10 + 10 units and 2 common spaces', () => {
    expect(SEED_ROOMS).toHaveLength(27);
    expect(SEED_ROOMS.filter(isUnit)).toHaveLength(25);
  });

  it('gives every residential unit either a positive rent rate or an unconfirmed null', () => {
    for (const room of SEED_ROOMS.filter(isUnit)) {
      expect(room.rentRate === null || room.rentRate > 0).toBe(true);
    }
  });

  // Regression guard for the error this correction pass exists to fix. The
  // seed once carried 2,636 for room 101 and 4,563 for 102, taken from the
  // ค่าห้องฯ column of แบบฟอร์มเก็บเงินค่าห้อง — which is a month's *total*
  // bill, not rent. 101's true rent is 2,200 (2,636 = 2,200 + 336 ไฟ + 100
  // น้ำ), verified against ใบแจ้งค่าห้องพัก. If these ever read as the totals
  // again, the whole billing chain is inflated by a month of utilities.
  it('carries rent alone, never a month total', () => {
    const byId = new Map(SEED_ROOMS.map((room) => [room.id, room]));
    expect(byId.get('101')?.rentRate).toBe(2200);
    expect(byId.get('102')?.rentRate).toBe(3000);
    expect(byId.get('310')?.rentRate).toBe(2300);
  });

  it('includes the laundry as a metered common space that does carry a real rent', () => {
    const laundry = SEED_ROOMS.find((r) => r.id === 'laundry');
    expect(laundry?.kind).toBe('common');
    expect(laundry?.hasMeter).toBe(true);
    expect(laundry?.rentRate).toBe(1800);
  });

  it('leaves the undercroft with no confirmed rent', () => {
    const undercroft = SEED_ROOMS.find((r) => r.id === 'undercroft');
    expect(undercroft?.kind).toBe('common');
    expect(undercroft?.hasMeter).toBe(false);
    expect(undercroft?.rentRate).toBeNull();
  });

  // The undercroft is the tell that distinguishes seed from live: the sheet
  // calls it ห้องเช่าส่วนกลาง on floor 1. If the console ever shows both the
  // seed label and live data, one of the two is not what it claims to be.
  it('keeps the undercroft label that marks this as the seed, not the live sheet', () => {
    const undercroft = SEED_ROOMS.find((r) => r.id === 'undercroft');
    expect(undercroft?.label).toBe('ห้องใต้ถุน');
    expect(undercroft?.floor).toBe(0);
  });

  it('records the rooms that are out of service rather than calling everything occupied', () => {
    const byStatus = (status: string) => SEED_ROOMS.filter((r) => r.status === status).map((r) => r.id);
    expect(byStatus('maintenance')).toEqual(['104', '204', '209']);
    expect(byStatus('available')).toEqual(['undercroft']);
  });

  it('marks the fan-only rooms as having no air conditioner', () => {
    const byId = new Map(SEED_ROOMS.map((room) => [room.id, room]));
    expect(byId.get('102')?.appliances.aircon).toBe(false);
    expect(byId.get('101')?.appliances.aircon).toBe(true);
  });
});

describe('createMemoryRoomRepository', () => {
  it('lists every seeded room', async () => {
    const repo = createMemoryRoomRepository();
    expect(await repo.listRooms()).toHaveLength(27);
  });

  it('finds a room by id', async () => {
    const repo = createMemoryRoomRepository();
    expect((await repo.getRoom('203'))?.label).toBe('203');
  });

  it('returns null for an unknown id', async () => {
    const repo = createMemoryRoomRepository();
    expect(await repo.getRoom('999')).toBeNull();
  });

  it('accepts an explicit room list for tests', async () => {
    const repo = createMemoryRoomRepository([makeRoom({ rentRate: 100 })]);
    expect(await repo.listRooms()).toHaveLength(1);
  });

  it('hands callers their own copy so mutations cannot reach the seed', async () => {
    const repo = createMemoryRoomRepository();
    const room = await repo.getRoom('101');
    room!.label = 'MUTATED';
    expect((await repo.getRoom('101'))?.label).toBe('101');

    const list = await repo.listRooms();
    list[0]!.label = 'MUTATED';
    expect((await repo.listRooms())[0]?.label).toBe('101');
  });

  // A shallow spread would hand every caller the same appliances object, so
  // one screen's edit would silently rewrite the seed for every other.
  it('copies nested appliances too, not just the top level', async () => {
    const repo = createMemoryRoomRepository();
    const room = await repo.getRoom('101');
    room!.appliances.tv = true;
    expect((await repo.getRoom('101'))?.appliances.tv).toBe(false);
  });

  it('generates the double-digit ids at the padding boundary', async () => {
    const repo = createMemoryRoomRepository();
    expect((await repo.getRoom('210'))?.label).toBe('210');
    expect((await repo.getRoom('310'))?.label).toBe('310');
    expect(await repo.getRoom('2010')).toBeNull();
  });
});
