import { describe, expect, it } from 'vitest';
import { isLettable } from '@/lib/models/room';
import { createMemoryRoomRepository, SEED_ROOMS } from './memory-room-repository';

describe('SEED_ROOMS', () => {
  it('holds the full registry: 5 + 10 + 10 units and 2 common spaces', () => {
    expect(SEED_ROOMS).toHaveLength(27);
    expect(SEED_ROOMS.filter(isLettable)).toHaveLength(25);
  });

  it('gives every lettable unit a positive rent rate', () => {
    for (const room of SEED_ROOMS.filter(isLettable)) {
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
      { id: '101', label: '101', floor: 1, kind: 'lettable', rentRate: 100, hasMeter: true },
    ]);
    expect(await repo.listRooms()).toHaveLength(1);
  });
});
