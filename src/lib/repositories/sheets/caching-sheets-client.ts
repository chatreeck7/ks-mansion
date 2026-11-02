import type { CellValue, SheetsClient } from './sheets-client';

/**
 * A short read cache in front of the Sheets client (KS-55, revisited
 * 2026-11-02).
 *
 * KS-55 decided not to cache tab contents while a page view cost one read.
 * That stopped being true: the home page, the bill run and the documents each
 * read four to six tabs, and an admin clicking through the console on the
 * live sheet hit the 60 reads/minute/user quota within a minute — every page
 * then answered 500 until the window rolled over. That is condition 3 of the
 * "revisit read caching" list in `docs/data-layer.md`, so this is the TTL
 * wrapper that document said to put here.
 *
 * - **TTL per tab.** A tab read within `ttlMs` of the last one is served
 *   from memory. `ttlMs` is exactly how long an edit made directly in the
 *   spreadsheet can take to appear in the console.
 * - **The console's own writes invalidate immediately.** `appendRow` and
 *   `updateRow` drop that tab, so anything saved through the console shows
 *   on the next read — and so the parse-before-write guard always re-reads
 *   the row it is about to overwrite.
 * - **Concurrent reads share one request.** A page that asks for `leases`
 *   from three places in one render makes one API call, not three.
 * - **A failed read is not cached.**
 *
 * Callers receive a copy of the rows, so nothing a caller does to the array
 * it was handed can leak into another request's view.
 */

export const DEFAULT_TAB_CACHE_TTL_MS = 15_000;

interface Entry {
  at: number;
  values: Promise<string[][]>;
}

export function createCachingSheetsClient(
  inner: SheetsClient,
  options: { ttlMs?: number; now?: () => number } = {},
): SheetsClient & { invalidate(tabName?: string): void } {
  const ttlMs = options.ttlMs ?? DEFAULT_TAB_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const cache = new Map<string, Entry>();
  // Tab names resolve case-insensitively in Sheets (see sheet-schema.md), so
  // `rooms` and `Rooms` are one cache entry.
  const key = (tabName: string) => tabName.toLowerCase();
  const copy = (rows: string[][]) => rows.map((row) => [...row]);

  return {
    async getTabValues(tabName: string): Promise<string[][]> {
      const k = key(tabName);
      const hit = cache.get(k);
      if (hit && now() - hit.at < ttlMs) return copy(await hit.values);

      const values = inner.getTabValues(tabName);
      cache.set(k, { at: now(), values });
      try {
        return copy(await values);
      } catch (cause) {
        if (cache.get(k)?.values === values) cache.delete(k);
        throw cause;
      }
    },
    async appendRow(tabName: string, values: CellValue[]): Promise<void> {
      cache.delete(key(tabName));
      try {
        await inner.appendRow(tabName, values);
      } finally {
        cache.delete(key(tabName));
      }
    },
    async updateRow(tabName: string, rowNumber: number, values: CellValue[]): Promise<void> {
      cache.delete(key(tabName));
      try {
        await inner.updateRow(tabName, rowNumber, values);
      } finally {
        cache.delete(key(tabName));
      }
    },
    invalidate(tabName?: string) {
      if (tabName === undefined) cache.clear();
      else cache.delete(key(tabName));
    },
  };
}
