import type { Tenant } from '@/lib/models/tenant';
import type { TenantRepository } from '../tenant-repository';
import type { SheetsClient } from './sheets-client';
import { readTab, requireCell, SheetRowError, type Tab } from './tab-reader';

const TAB_NAME = 'tenants';

/** `nickname` is optional; everything else must resolve to build a Tenant. */
const REQUIRED_COLUMNS = ['id', 'full_name', 'id_card_last4', 'address', 'phone'] as const;

function parseTenant(tab: Tab, row: string[], rowNumber: number): Tenant {
  const cell = (name: string) => (row[tab.columnIndex[name]] ?? '').trim();

  const idCardLast4 = cell('id_card_last4');
  // Fail loud rather than storing what the column does not promise: a full
  // 13-digit ID here means someone pasted more than the schema allows, and
  // silently truncating would hide that the sheet holds a national ID.
  if (idCardLast4 && !/^\d{4}$/.test(idCardLast4)) {
    throw new SheetRowError(
      TAB_NAME,
      rowNumber,
      `"id_card_last4" must be exactly 4 digits (or blank), got "${idCardLast4}" — ` +
        'store only the last four digits of the ID card, never the full number',
    );
  }

  return {
    id: requireCell(tab, row, rowNumber, 'id'),
    fullName: requireCell(tab, row, rowNumber, 'full_name'),
    nickname: cell('nickname'),
    idCardLast4,
    address: cell('address'),
    phone: cell('phone'),
  };
}

/**
 * Reads the "tenants" tab per docs/sheet-schema.md: header resolved by name,
 * a stable id column, validated on read.
 *
 * `getTenant` reads only the row it needs rather than going through
 * `listTenants`, so a lookup for one tenant does not fail because of an
 * unrelated malformed row elsewhere — same reasoning as the room repository.
 */
export function createSheetsTenantRepository(client: SheetsClient): TenantRepository {
  return {
    async listTenants(): Promise<Tenant[]> {
      const tab = await readTab(client, TAB_NAME, REQUIRED_COLUMNS);
      const tenants: Tenant[] = [];
      const rowNumberById = new Map<string, number>();

      tab.dataRows.forEach((row, i) => {
        const rowNumber = i + 2; // +2: 1-indexed, plus the header row
        if (tab.isBlankRow(row)) return;

        const tenant = parseTenant(tab, row, rowNumber);
        const previousRow = rowNumberById.get(tenant.id);
        if (previousRow !== undefined) {
          throw new SheetRowError(
            TAB_NAME,
            rowNumber,
            `duplicate id "${tenant.id}", already used on row ${previousRow}`,
          );
        }
        rowNumberById.set(tenant.id, rowNumber);
        tenants.push(tenant);
      });

      return tenants;
    },

    async getTenant(id: string): Promise<Tenant | null> {
      const tab = await readTab(client, TAB_NAME, REQUIRED_COLUMNS);
      const match = tab.dataRows
        .map((row, i) => ({ row, rowNumber: i + 2 }))
        .find(
          ({ row }) =>
            !tab.isBlankRow(row) && (row[tab.columnIndex['id']!] ?? '').trim() === id,
        );

      return match ? parseTenant(tab, match.row, match.rowNumber) : null;
    },
  };
}
