import type { Lease } from '@/lib/models/lease';
import type { LeaseRepository } from '../lease-repository';
import type { SheetsClient } from './sheets-client';
import { parseThaiDate } from '@/lib/format/thai-parse';
import { cellValue, readTab, requireCell, SheetRowError, type Tab } from './tab-reader';

const TAB_NAME = 'leases';

/** `end_date` is optional — an open-ended tenancy leaves it blank. */
const REQUIRED_COLUMNS = [
  'id',
  'room_id',
  'tenant_id',
  'start_date',
  'rent_rate',
  'deposit',
  'advance_rent',
] as const;

/**
 * Dates are stored as **Thai Buddhist-era text** (`1 มี.ค. 2568` or
 * `1/3/2568`), not ISO.
 *
 * Two reasons. Admins read and write these cells directly and think in พ.ศ.,
 * so BE matches the paperwork they are copying from. And `parseThaiDate`
 * *rejects* a Gregorian year outright rather than reinterpreting it — a cell
 * reading `2026` fails loudly instead of silently becoming 1483 CE. Storing
 * ISO would make the common mistake (typing a BE year into a CE field)
 * silent, which is precisely the wrong trade for a field that drives billing
 * and deposit settlement.
 *
 * The column must be formatted as **plain text** in Sheets. Left as an
 * automatic or Date-formatted column, Sheets will try to interpret these as
 * CE dates and rewrite them. See docs/admin-collaboration.md.
 */
function parseDate(raw: string, rowNumber: number, column: string): Date {
  const date = parseThaiDate(raw);
  if (!date) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"${column}" is not a Thai (พ.ศ.) date: "${raw}" — expected e.g. "1 มี.ค. 2568" or "1/3/2568"`,
    );
  }
  return date;
}

function parseMoney(raw: string, rowNumber: number, column: string): number {
  // Tolerate the thousands separators an admin naturally types.
  const value = Number(raw.replace(/,/g, ''));
  if (raw.trim() === '' || !Number.isFinite(value)) {
    throw new SheetRowError(TAB_NAME, rowNumber, `"${column}" is not a number: "${raw}"`);
  }
  if (value < 0) {
    throw new SheetRowError(TAB_NAME, rowNumber, `"${column}" cannot be negative: "${raw}"`);
  }
  return value;
}

function parseLease(tab: Tab, row: string[], rowNumber: number): Lease {
  const startDate = parseDate(cellValue(tab, row, 'start_date'), rowNumber, 'start_date');

  const endRaw = cellValue(tab, row, 'end_date');
  const endDate = endRaw ? parseDate(endRaw, rowNumber, 'end_date') : null;

  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"end_date" (${endRaw}) is before "start_date" (${cellValue(tab, row, 'start_date')})`,
    );
  }

  return {
    id: requireCell(tab, row, rowNumber, 'id'),
    roomId: requireCell(tab, row, rowNumber, 'room_id'),
    tenantId: requireCell(tab, row, rowNumber, 'tenant_id'),
    startDate,
    endDate,
    rentRate: parseMoney(cellValue(tab, row, 'rent_rate'), rowNumber, 'rent_rate'),
    deposit: parseMoney(cellValue(tab, row, 'deposit'), rowNumber, 'deposit'),
    advanceRent: parseMoney(cellValue(tab, row, 'advance_rent'), rowNumber, 'advance_rent'),
  };
}

export function createSheetsLeaseRepository(client: SheetsClient): LeaseRepository {
  async function listLeases(): Promise<Lease[]> {
    const tab = await readTab(client, TAB_NAME, REQUIRED_COLUMNS);

    const leases: Lease[] = [];
    const rowNumberById = new Map<string, number>();
    tab.dataRows.forEach((row, i) => {
      const rowNumber = i + 2; // +2: 1-indexed, plus the header row
      if (tab.isBlankRow(row)) return;

      const lease = parseLease(tab, row, rowNumber);
      const previousRow = rowNumberById.get(lease.id);
      if (previousRow !== undefined) {
        throw new SheetRowError(
          TAB_NAME,
          rowNumber,
          `duplicate id "${lease.id}", already used on row ${previousRow}`,
        );
      }
      rowNumberById.set(lease.id, rowNumber);
      leases.push(lease);
    });

    return leases;
  }

  return {
    listLeases,
    async listLeasesForRoom(roomId: string) {
      return (await listLeases()).filter((lease) => lease.roomId === roomId);
    },
    async listLeasesForTenant(tenantId: string) {
      return (await listLeases()).filter((lease) => lease.tenantId === tenantId);
    },
  };
}
