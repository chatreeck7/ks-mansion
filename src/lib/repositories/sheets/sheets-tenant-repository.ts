import type { EvaluationGrade, Tenant, ThaiAddress } from '@/lib/models/tenant';
import type { TenantRepository } from '../tenant-repository';
import type { SheetsClient } from './sheets-client';
import {
  cellValue,
  optionalEnumCell,
  readTab,
  requireCell,
  SheetRowError,
  type Tab,
  type TabContract,
} from './tab-reader';

const TAB_NAME = 'tenants';

const GRADES: readonly EvaluationGrade[] = ['A', 'B', 'C'];

/**
 * Every column here must exist in the header; only `id` and `full_name` make
 * a row a record.
 *
 * The split matters for the free-text columns. A sparse address is normal —
 * plenty of tenants give a house number and nothing else — and `note` is
 * where an admin writes things like `(เลี้ยงแมว)`. Requiring a *value* in
 * those would reject real rows; leaving them out of the header check would
 * let a typo'd `occupatoin` read as empty for every tenant, forever, without
 * a word. Both lists, therefore.
 */
const CONTRACT: TabContract = {
  columns: [
    'id',
    'full_name',
    'nickname',
    'id_card_last4',
    'phone',
    'occupation',
    'evaluation_grade',
    'note',
    'address_house_no',
    'address_road',
    'address_subdistrict',
    'address_district',
    'address_province',
    'address_postcode',
  ],
  identity: ['id', 'full_name'],
};

function parseAddress(tab: Tab, row: string[]): ThaiAddress {
  return {
    houseNo: cellValue(tab, row, 'address_house_no'),
    road: cellValue(tab, row, 'address_road'),
    subdistrict: cellValue(tab, row, 'address_subdistrict'),
    district: cellValue(tab, row, 'address_district'),
    province: cellValue(tab, row, 'address_province'),
    postcode: cellValue(tab, row, 'address_postcode'),
  };
}

function parseTenant(tab: Tab, row: string[], rowNumber: number): Tenant {
  const idCardLast4 = cellValue(tab, row, 'id_card_last4');
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
    nickname: cellValue(tab, row, 'nickname'),
    idCardLast4,
    address: parseAddress(tab, row),
    phone: cellValue(tab, row, 'phone'),
    occupation: cellValue(tab, row, 'occupation'),
    evaluationGrade: optionalEnumCell(tab, row, rowNumber, 'evaluation_grade', GRADES),
    note: cellValue(tab, row, 'note'),
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
      const tab = await readTab(client, TAB_NAME, CONTRACT);
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
      const tab = await readTab(client, TAB_NAME, CONTRACT);
      const match = tab.dataRows
        .map((row, i) => ({ row, rowNumber: i + 2 }))
        .find(({ row }) => !tab.isBlankRow(row) && cellValue(tab, row, 'id') === id);

      return match ? parseTenant(tab, match.row, match.rowNumber) : null;
    },
  };
}
