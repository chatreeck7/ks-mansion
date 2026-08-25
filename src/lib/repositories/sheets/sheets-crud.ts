import { ARCHIVED_COLUMN, type Archivable } from '@/lib/models/archivable';
import type { SheetsClient } from './sheets-client';
import {
  findRow,
  readTab,
  sheetRowNumber,
  SheetRowError,
  type Tab,
  type TabContract,
} from './tab-reader';
import { buildRow, nextId, type RowValues } from './tab-writer';

/** Every entity tab has a stable id column (docs/sheet-schema.md rule 3). */
export type EntityRecord = Archivable & { id: string };

/**
 * The parts of a tab that genuinely differ per entity. Everything else — the
 * read/write machinery below — is shared.
 *
 * Extracted up front rather than after the third copy, which is the usual
 * rule in this codebase. The difference is that all three callers are written
 * in this same change, so the shape is known rather than guessed; and what
 * lives here is not boilerplate but *rules*: re-find the row before writing,
 * never write a row that would not read back, never let an archived record
 * free its id. Three copies of a rule is three chances for one of them to
 * quietly stop matching.
 */
export interface EntitySpec<T extends EntityRecord, D> {
  tabName: string;
  contract: TabContract;
  /** What this entity is called in an error a person has to act on. */
  label: string;
  parse(tab: Tab, row: string[], rowNumber: number): T;
  /** Model fields as named sheet cells — the inverse of `parse`. */
  toRowValues(fields: Partial<D>): RowValues;
  /**
   * Prefix for generated ids (`t-`, `l-`). Omitted for an entity that cannot
   * be created through the console — rooms, whose ids are physical room
   * numbers that already exist.
   */
  idPrefix?: string;
}

export interface SheetsCrud<T extends EntityRecord, D> {
  /** Excludes archived records. */
  list(): Promise<T[]>;
  /** Includes archived records, so an old link still resolves. */
  get(id: string): Promise<T | null>;
  create(draft: D): Promise<T>;
  update(id: string, changes: Partial<D>): Promise<T>;
  archive(id: string): Promise<T>;
}

export function createSheetsCrud<T extends EntityRecord, D>(
  client: SheetsClient,
  spec: EntitySpec<T, D>,
): SheetsCrud<T, D> {
  const { tabName, contract, label, parse } = spec;

  /**
   * Parses the row that is about to be written, and refuses to write if it
   * would not read back.
   *
   * This is what keeps the write and read paths in agreement without stating
   * every rule twice. A separate set of inbound validations drifts the moment
   * one side gains a rule the other lacks, and the failure shows up as a row
   * that saved cleanly and then broke the whole tab on the next page load.
   */
  function validated(tab: Tab, row: unknown[], rowNumber: number): T {
    // Validate the *strings the sheet will hold*, not the typed values on the
    // way in — that is what the reader will be handed.
    const asStrings = row.map((cell) =>
      typeof cell === 'boolean' ? (cell ? 'TRUE' : 'FALSE') : String(cell ?? ''),
    );
    try {
      return parse(tab, asStrings, rowNumber);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Refusing to write an unreadable ${label} row: ${reason}`, { cause });
    }
  }

  async function writeInto(id: string, values: RowValues): Promise<T> {
    // Re-read rather than trusting a row number from an earlier read: there
    // is no compare-and-swap, and an admin inserting a row shifts every
    // number below it. See `findRow`.
    const tab = await readTab(client, tabName, contract);
    const found = findRow(tab, 'id', id);
    if (!found) throw new Error(`No ${label} with id "${id}".`);

    const next = buildRow(tab, found.row, values);
    const entity = validated(tab, next, found.rowNumber);

    await client.updateRow(tabName, found.rowNumber, next);
    return entity;
  }

  return {
    async list(): Promise<T[]> {
      const tab = await readTab(client, tabName, contract);
      const records: T[] = [];
      const rowNumberById = new Map<string, number>();

      tab.dataRows.forEach((row, i) => {
        const rowNumber = sheetRowNumber(i);
        if (tab.isBlankRow(row)) return;

        const entity = parse(tab, row, rowNumber);
        const previousRow = rowNumberById.get(entity.id);
        if (previousRow !== undefined) {
          throw new SheetRowError(
            tabName,
            rowNumber,
            `duplicate id "${entity.id}", already used on row ${previousRow}`,
          );
        }
        rowNumberById.set(entity.id, rowNumber);

        // Archived rows still take part in the duplicate check — an id stays
        // spent whether or not the record is still active, or archiving one
        // record would let the next one be handed its id and inherit its
        // history.
        if (!entity.archived) records.push(entity);
      });

      return records;
    },

    async get(id: string): Promise<T | null> {
      // Deliberately not routed through `list`: parsing only the row asked
      // for means a lookup never fails because of an unrelated malformed row
      // elsewhere in the tab. It also means this skips `list`'s whole-tab
      // duplicate check, which is a tab-integrity concern rather than a
      // per-lookup one.
      const tab = await readTab(client, tabName, contract);
      const found = findRow(tab, 'id', id);
      return found ? parse(tab, found.row, found.rowNumber) : null;
    },

    async create(draft: D): Promise<T> {
      const { idPrefix } = spec;
      if (!idPrefix) {
        throw new Error(`A ${label} cannot be created through the console.`);
      }

      const tab = await readTab(client, tabName, contract);
      const id = nextId(tab, 'id', idPrefix);
      if (findRow(tab, 'id', id)) {
        // `nextId` ignores ids that do not fit the pattern when numbering, so
        // a hand-typed one can still be sitting on the number it picked.
        throw new Error(`Cannot create ${label}: id "${id}" is already in use.`);
      }

      const row = buildRow(tab, null, {
        ...spec.toRowValues(draft),
        id,
        [ARCHIVED_COLUMN]: false,
      });
      const entity = validated(tab, row, sheetRowNumber(tab.dataRows.length));

      await client.appendRow(tabName, row);
      return entity;
    },

    async update(id: string, changes: Partial<D>): Promise<T> {
      return writeInto(id, spec.toRowValues(changes));
    },

    async archive(id: string): Promise<T> {
      return writeInto(id, { [ARCHIVED_COLUMN]: true });
    },
  };
}
