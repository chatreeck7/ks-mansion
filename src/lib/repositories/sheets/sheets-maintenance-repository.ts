import { formatThaiDate } from '@/lib/format/thai';
import { parseThaiDate } from '@/lib/format/thai-parse';
import { ARCHIVED_COLUMN } from '@/lib/models/archivable';
import {
  EQUIPMENT_KINDS,
  type Equipment,
  type EquipmentDraft,
  type MaintenanceRecord,
  type MaintenanceRecordDraft,
} from '@/lib/models/maintenance';
import type { MaintenanceRepository } from '../maintenance-repository';
import { createSheetsCrud, type EntitySpec } from './sheets-crud';
import type { SheetsClient } from './sheets-client';
import {
  cellValue,
  enumCell,
  nullableBooleanCell,
  numberCell,
  optionalNumberCell,
  requireCell,
  SheetRowError,
  type Tab,
  type TabContract,
  type TabDescriptor,
} from './tab-reader';
import type { RowValues } from './tab-writer';

/**
 * Two tabs, `equipment` and `maintenance_logs`, in the same shape as every
 * other: an id column, header-named cells, `archived` for soft delete. The
 * year is written in พ.ศ. and the day as Thai text, so the sheet reads like
 * the paper it replaces when an admin opens it directly.
 */

const EQUIPMENT_TAB = 'equipment';
const LOGS_TAB = 'maintenance_logs';

const EQUIPMENT_CONTRACT: TabContract = {
  columns: ['id', 'name', 'kind', 'brand', 'room_id', 'position', 'note', ARCHIVED_COLUMN],
  identity: ['id', 'name', 'kind'],
};

const LOGS_CONTRACT: TabContract = {
  columns: ['id', 'equipment_id', 'year', 'done_on', 'work', 'cost', 'note', ARCHIVED_COLUMN],
  identity: ['id', 'equipment_id', 'year', 'work'],
};

export const EQUIPMENT_TAB_DESCRIPTOR: TabDescriptor = { tabName: EQUIPMENT_TAB, contract: EQUIPMENT_CONTRACT };
export const MAINTENANCE_LOGS_TAB_DESCRIPTOR: TabDescriptor = { tabName: LOGS_TAB, contract: LOGS_CONTRACT };

function parseEquipment(tab: Tab, row: string[], rowNumber: number): Equipment {
  return {
    id: requireCell(tab, row, rowNumber, 'id'),
    name: requireCell(tab, row, rowNumber, 'name'),
    kind: enumCell(tab, row, rowNumber, 'kind', EQUIPMENT_KINDS),
    brand: cellValue(tab, row, 'brand'),
    roomId: cellValue(tab, row, 'room_id') || null,
    position: optionalNumberCell(tab, row, rowNumber, 'position') ?? 0,
    note: cellValue(tab, row, 'note'),
    archived: nullableBooleanCell(tab, row, rowNumber, ARCHIVED_COLUMN) ?? false,
  };
}

function equipmentValues(fields: Partial<EquipmentDraft>): RowValues {
  const values: RowValues = {};
  if (fields.name !== undefined) values['name'] = fields.name;
  if (fields.kind !== undefined) values['kind'] = fields.kind;
  if (fields.brand !== undefined) values['brand'] = fields.brand;
  if (fields.roomId !== undefined) values['room_id'] = fields.roomId ?? '';
  if (fields.position !== undefined) values['position'] = fields.position;
  if (fields.note !== undefined) values['note'] = fields.note;
  return values;
}

function parseRecord(tab: Tab, row: string[], rowNumber: number): MaintenanceRecord {
  const yearBE = numberCell(tab, row, rowNumber, 'year');
  if (!Number.isInteger(yearBE) || yearBE < 2500 || yearBE > 2700) {
    throw new SheetRowError(tab.tabName, rowNumber, `"year" must be a พ.ศ. year such as 2569, got "${cellValue(tab, row, 'year')}"`);
  }
  const raw = cellValue(tab, row, 'done_on');
  const doneOn = raw ? parseThaiDate(raw) : null;
  if (raw && !doneOn) {
    throw new SheetRowError(tab.tabName, rowNumber, `"done_on" is not a Thai (พ.ศ.) date: "${raw}"`);
  }
  if (doneOn && doneOn.getFullYear() + 543 !== yearBE) {
    throw new SheetRowError(tab.tabName, rowNumber, `"done_on" ${raw} is not in year ${yearBE}`);
  }
  return {
    id: requireCell(tab, row, rowNumber, 'id'),
    equipmentId: requireCell(tab, row, rowNumber, 'equipment_id'),
    yearBE,
    doneOn,
    work: requireCell(tab, row, rowNumber, 'work'),
    cost: optionalNumberCell(tab, row, rowNumber, 'cost'),
    note: cellValue(tab, row, 'note'),
    archived: nullableBooleanCell(tab, row, rowNumber, ARCHIVED_COLUMN) ?? false,
  };
}

function recordValues(fields: Partial<MaintenanceRecordDraft>): RowValues {
  const values: RowValues = {};
  if (fields.equipmentId !== undefined) values['equipment_id'] = fields.equipmentId;
  if (fields.yearBE !== undefined) values['year'] = fields.yearBE;
  if (fields.doneOn !== undefined) values['done_on'] = fields.doneOn ? formatThaiDate(fields.doneOn) : '';
  if (fields.work !== undefined) values['work'] = fields.work;
  if (fields.cost !== undefined) values['cost'] = fields.cost ?? '';
  if (fields.note !== undefined) values['note'] = fields.note;
  return values;
}

const EQUIPMENT_SPEC: EntitySpec<Equipment, EquipmentDraft> = {
  tabName: EQUIPMENT_TAB,
  contract: EQUIPMENT_CONTRACT,
  label: 'equipment',
  parse: parseEquipment,
  toRowValues: equipmentValues,
  idPrefix: 'eq-',
};

const LOGS_SPEC: EntitySpec<MaintenanceRecord, MaintenanceRecordDraft> = {
  tabName: LOGS_TAB,
  contract: LOGS_CONTRACT,
  label: 'maintenance record',
  parse: parseRecord,
  toRowValues: recordValues,
  idPrefix: 'mt-',
};

export function createSheetsMaintenanceRepository(client: SheetsClient): MaintenanceRepository {
  const equipment = createSheetsCrud(client, EQUIPMENT_SPEC);
  const logs = createSheetsCrud(client, LOGS_SPEC);
  return {
    listEquipment: equipment.list,
    addEquipment: equipment.create,
    updateEquipment: equipment.update,
    archiveEquipment: equipment.archive,
    listRecords: logs.list,
    addRecord: logs.create,
    addRecords: logs.createMany,
    archiveRecord: logs.archive,
  };
}
