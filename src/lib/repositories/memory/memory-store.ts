import type { EntityRecord } from '../sheets/sheets-crud';

/**
 * The in-memory half of each repository, matching the Sheets half's
 * observable behaviour: list excludes archived records, get includes them,
 * ids are generated once and never reused, and callers always get their own
 * copy so a mutation cannot reach the store.
 *
 * Behaving the *same* is the whole point. This is what runs in local dev and
 * in every test that does not care where data comes from, so a difference
 * here shows up as a bug that only reproduces against the real sheet.
 */
export interface MemoryStore<T extends EntityRecord, D> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(draft: D): Promise<T>;
  update(id: string, changes: Partial<D>): Promise<T>;
  archive(id: string): Promise<T>;
}

export interface MemoryStoreOptions<T> {
  /** What this entity is called in an error a person has to act on. */
  label: string;
  /** Prefix for generated ids; omitted for an entity that cannot be created. */
  idPrefix?: string;
  /**
   * A deep-enough copy. Per-entity because a shallow spread would share the
   * nested objects — `appliances`, `address` — so one caller's edit would
   * silently rewrite the seed for every other.
   */
  copy(record: T): T;
}

export function createMemoryStore<T extends EntityRecord, D>(
  records: T[],
  options: MemoryStoreOptions<T>,
): MemoryStore<T, D> {
  const { label, idPrefix, copy } = options;

  function find(id: string): T {
    const record = records.find((r) => r.id === id);
    if (!record) throw new Error(`No ${label} with id "${id}".`);
    return record;
  }

  /** Mirrors `nextId` in tab-writer: highest numeric suffix, plus one. */
  function nextId(prefix: string): string {
    const highest = records.reduce((max, record) => {
      if (!record.id.startsWith(prefix)) return max;
      const suffix = record.id.slice(prefix.length);
      return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
    }, 0);
    return `${prefix}${String(highest + 1).padStart(3, '0')}`;
  }

  function replace(record: T, changes: Partial<T>): T {
    const next = { ...record, ...changes };
    records[records.indexOf(record)] = next;
    return copy(next);
  }

  return {
    async list() {
      return records.filter((record) => !record.archived).map(copy);
    },

    async get(id) {
      const record = records.find((r) => r.id === id);
      return record ? copy(record) : null;
    },

    async create(draft) {
      if (!idPrefix) throw new Error(`A ${label} cannot be created through the console.`);

      const record = { ...(draft as object), id: nextId(idPrefix), archived: false } as T;
      records.push(record);
      return copy(record);
    },

    async update(id, changes) {
      return replace(find(id), changes as Partial<T>);
    },

    async archive(id) {
      return replace(find(id), { archived: true } as Partial<T>);
    },
  };
}
