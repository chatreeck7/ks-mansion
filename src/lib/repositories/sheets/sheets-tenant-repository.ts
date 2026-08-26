import { ARCHIVED_COLUMN } from '@/lib/models/archivable';
import type { EvaluationGrade, Tenant, ThaiAddress } from '@/lib/models/tenant';
import type { TenantDraft, TenantRepository } from '../tenant-repository';
import { createSheetsCrud, type EntitySpec } from './sheets-crud';
import type { SheetsClient } from './sheets-client';
import {
  cellValue,
  nullableBooleanCell,
  optionalEnumCell,
  requireCell,
  SheetRowError,
  type Tab,
  type TabContract,
} from './tab-reader';
import type { RowValues } from './tab-writer';

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
    ARCHIVED_COLUMN,
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
  // Because writes are validated by parsing the row they are about to write,
  // this also stops a full ID from being saved in the first place.
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
    // Blank reads as "not archived" — the documented exception to
    // blank-is-not-false. An admin adding a row by hand leaves it empty, and
    // the harm is asymmetric: an archived tenant shown as active is a
    // nuisance, where a live tenant hidden as archived loses their billing.
    archived: nullableBooleanCell(tab, row, rowNumber, ARCHIVED_COLUMN) ?? false,
  };
}

/** The inverse of `parseTenant`: model fields as named sheet cells. */
function toRowValues(fields: Partial<TenantDraft>): RowValues {
  const values: RowValues = {};

  if (fields.fullName !== undefined) values['full_name'] = fields.fullName;
  if (fields.nickname !== undefined) values['nickname'] = fields.nickname;
  if (fields.idCardLast4 !== undefined) values['id_card_last4'] = fields.idCardLast4;
  if (fields.phone !== undefined) values['phone'] = fields.phone;
  if (fields.occupation !== undefined) values['occupation'] = fields.occupation;
  if (fields.note !== undefined) values['note'] = fields.note;
  // `null` is "not yet assessed", which is a blank cell rather than the
  // string "null".
  if (fields.evaluationGrade !== undefined) {
    values['evaluation_grade'] = fields.evaluationGrade ?? '';
  }

  if (fields.address !== undefined) {
    values['address_house_no'] = fields.address.houseNo;
    values['address_road'] = fields.address.road;
    values['address_subdistrict'] = fields.address.subdistrict;
    values['address_district'] = fields.address.district;
    values['address_province'] = fields.address.province;
    values['address_postcode'] = fields.address.postcode;
  }

  return values;
}

const SPEC: EntitySpec<Tenant, TenantDraft> = {
  tabName: TAB_NAME,
  contract: CONTRACT,
  label: 'tenant',
  parse: parseTenant,
  toRowValues,
  idPrefix: 't-',
};

/**
 * Reads and writes the "tenants" tab per docs/sheet-schema.md: header
 * resolved by name, a stable id column, validated on read *and* on the way
 * out. Everything structural lives in `sheets-crud.ts`; what is here is the
 * tenant-shaped part.
 */
export function createSheetsTenantRepository(client: SheetsClient): TenantRepository {
  const crud = createSheetsCrud(client, SPEC);

  return {
    listTenants: crud.list,
    getTenant: crud.get,
    createTenant: crud.create,
    updateTenant: crud.update,
    archiveTenant: crud.archive,
  };
}
