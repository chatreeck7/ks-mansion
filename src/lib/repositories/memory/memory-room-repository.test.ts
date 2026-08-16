import { describe, expect, it } from 'vitest';
import { isUnit } from '@/lib/models/room';
import { createMemoryRoomRepository, SEED_ROOMS } from './memory-room-repository';

describe('SEED_ROOMS', () => {
  it('holds the full registry: 5 + 10 + 10 units and 2 common spaces', () => {
    expect(SEED_ROOMS).toHaveLength(27);
    expect(SEED_ROOMS.filter(isUnit)).toHaveLength(25);
  });

  it('gives every residential unit a positive rent rate', () => {
    for (const room of SEED_ROOMS.filter(isUnit)) {
      expect(room.rentRate).toBeGreaterThan(0);
    }
  });

  it('includes the laundry as a metered common space', () => {
    const laundry = SEED_ROOMS.find((r) => r.id === 'laundry');
    expect(laundry?.kind).toBe('common');
    expect(laundry?.hasMeter).toBe(true);
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
    const repo = createMemoryRoomRepository([
      { id: '101', label: '101', floor: 1, kind: 'unit', rentRate: 100, hasMeter: true },
    ]);
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

  it('generates the double-digit ids at the padding boundary', async () => {
    const repo = createMemoryRoomRepository();
    expect((await repo.getRoom('210'))?.label).toBe('210');
    expect((await repo.getRoom('310'))?.label).toBe('310');
    expect(await repo.getRoom('2010')).toBeNull();
  });
});
