import { describe, expect, it, vi } from 'vitest';
import { createCachingSheetsClient } from './caching-sheets-client';
import type { SheetsClient } from './sheets-client';

function fakeInner(): SheetsClient & { reads: ReturnType<typeof vi.fn> } {
  let version = 0;
  const reads = vi.fn(async (tab: string) => [['id'], [`${tab}-${++version}`]]);
  return {
    reads,
    getTabValues: reads,
    appendRow: vi.fn(async () => {}),
    appendRows: vi.fn(async () => {}),
    updateRow: vi.fn(async () => {}),
  };
}

describe('createCachingSheetsClient', () => {
  it('serves a second read inside the TTL from memory, and re-reads after it', async () => {
    let t = 0;
    const inner = fakeInner();
    const client = createCachingSheetsClient(inner, { ttlMs: 15_000, now: () => t });

    expect(await client.getTabValues('rooms')).toEqual([['id'], ['rooms-1']]);
    t = 14_999;
    expect(await client.getTabValues('Rooms')).toEqual([['id'], ['rooms-1']]);
    expect(inner.reads).toHaveBeenCalledTimes(1);

    t = 15_000;
    expect(await client.getTabValues('rooms')).toEqual([['id'], ['rooms-2']]);
    expect(inner.reads).toHaveBeenCalledTimes(2);
  });

  it('drops a tab when the console writes to it, so its own save shows at once', async () => {
    const inner = fakeInner();
    const client = createCachingSheetsClient(inner, { now: () => 0 });
    await client.getTabValues('bills');
    await client.getTabValues('rooms');

    await client.updateRow('bills', 2, ['x']);
    expect(await client.getTabValues('bills')).toEqual([['id'], ['bills-3']]);
    // Other tabs are untouched.
    expect(await client.getTabValues('rooms')).toEqual([['id'], ['rooms-2']]);

    await client.appendRow('rooms', ['y']);
    expect(await client.getTabValues('rooms')).toEqual([['id'], ['rooms-4']]);
  });

  it('shares one request between reads of the same tab that overlap', async () => {
    const inner = fakeInner();
    const client = createCachingSheetsClient(inner, { now: () => 0 });
    const [a, b] = await Promise.all([client.getTabValues('leases'), client.getTabValues('leases')]);
    expect(a).toEqual(b);
    expect(inner.reads).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed read', async () => {
    const inner = fakeInner();
    inner.reads.mockRejectedValueOnce(new Error('429'));
    const client = createCachingSheetsClient(inner, { now: () => 0 });
    await expect(client.getTabValues('rooms')).rejects.toThrow('429');
    expect(await client.getTabValues('rooms')).toEqual([['id'], ['rooms-1']]);
  });

  it('hands each caller its own copy', async () => {
    const client = createCachingSheetsClient(fakeInner(), { now: () => 0 });
    const first = await client.getTabValues('rooms');
    first[1]![0] = 'mutated';
    expect((await client.getTabValues('rooms'))[1]![0]).toBe('rooms-1');
  });
});
