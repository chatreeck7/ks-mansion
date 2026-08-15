import { describe, expect, it } from 'vitest';
import { getRoomRepository } from './index';

describe('getRoomRepository', () => {
  it('returns a repository backed by the seeded registry', async () => {
    expect(await getRoomRepository().listRooms()).toHaveLength(27);
  });
});
