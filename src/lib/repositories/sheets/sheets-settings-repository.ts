import { ARCHIVED_COLUMN } from '@/lib/models/archivable';
import { definitionFor, resolveSettings, settingProblem, type Setting } from '@/lib/models/settings';
import type { SettingsRepository } from '../settings-repository';
import { createSheetsCrud, type EntitySpec } from './sheets-crud';
import type { SheetsClient } from './sheets-client';
import {
  cellValue,
  nullableBooleanCell,
  requireCell,
  type Tab,
  type TabContract,
  type TabDescriptor,
} from './tab-reader';
import type { RowValues } from './tab-writer';

const TAB_NAME = 'settings';

/**
 * `id` is the setting's key (`payee_bank`) — a fixed name the code looks up,
 * not a sequence. `note` is free text for whoever edits the sheet by hand.
 */
const CONTRACT: TabContract = {
  columns: ['id', 'value', 'note', ARCHIVED_COLUMN],
  identity: ['id'],
};

type SettingDraft = Omit<Setting, 'key' | 'archived'>;

function parseSetting(tab: Tab, row: string[], rowNumber: number): Setting & { id: string } {
  const key = requireCell(tab, row, rowNumber, 'id');
  return {
    id: key,
    key,
    value: cellValue(tab, row, 'value'),
    note: cellValue(tab, row, 'note'),
    archived: nullableBooleanCell(tab, row, rowNumber, ARCHIVED_COLUMN) ?? false,
  };
}

function toRowValues(fields: Partial<SettingDraft>): RowValues {
  const values: RowValues = {};
  if (fields.value !== undefined) values['value'] = fields.value;
  if (fields.note !== undefined) values['note'] = fields.note;
  return values;
}

export const SETTINGS_TAB: TabDescriptor = { tabName: TAB_NAME, contract: CONTRACT };

const SPEC: EntitySpec<Setting & { id: string }, SettingDraft> = {
  tabName: TAB_NAME,
  contract: CONTRACT,
  label: 'setting',
  parse: parseSetting,
  toRowValues,
};

export function createSheetsSettingsRepository(client: SheetsClient): SettingsRepository {
  const crud = createSheetsCrud(client, SPEC);
  return {
    listSettings: crud.list,
    async resolveSettings() {
      return resolveSettings(await crud.list());
    },
    async saveSetting(key: string, value: string) {
      const definition = definitionFor(key);
      if (!definition) throw new Error(`"${key}" is not a setting the console knows.`);
      const problem = settingProblem(definition, value);
      if (problem) throw new Error(problem);
      const trimmed = definition.kind === 'multiline' ? value.replace(/\r\n/g, '\n').trim() : value.trim();
      const existing = await crud.get(key);
      if (existing) return crud.update(key, { value: trimmed });
      return crud.createWithId(key, { value: trimmed, note: definition.label });
    },
  };
}
