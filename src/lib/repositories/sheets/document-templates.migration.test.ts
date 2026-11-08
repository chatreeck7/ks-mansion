import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTRACT_BLOCKS } from '@/lib/documents/default-contract';
import { createGoogleSheetsClient, mintAccessToken } from './google-sheets-client';
import {
  createSheetsDocumentTemplateRepository,
  DOCUMENT_TEMPLATES_TAB,
} from './sheets-document-template-repository';
import { LEASES_TAB } from './sheets-lease-repository';
import { createSheetsSettingsRepository, SETTINGS_TAB } from './sheets-settings-repository';
import { createSheetsTenantRepository, TENANTS_TAB } from './sheets-tenant-repository';
import { createSheetsLeaseRepository } from './sheets-lease-repository';
import {
  createSheetsMaintenanceRepository,
  EQUIPMENT_TAB_DESCRIPTOR,
  MAINTENANCE_LOGS_TAB_DESCRIPTOR,
} from './sheets-maintenance-repository';
import { parseThaiDate } from '@/lib/format/thai-parse';
import type { EquipmentKind } from '@/lib/models/maintenance';

/**
 * Sets the live spreadsheet up for editable documents (KS-31, KS-24).
 *
 *   KS_MANSION_DB_SPREADSHEET_ID=<the live id> \
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
 *   KS_SETTINGS_FILE=/path/to/settings.json \   # optional {"key": "value"}
 *   KS31_APPLY=dry-run \                        # or `yes`
 *   npx vitest run src/lib/repositories/sheets/document-templates.migration.test.ts
 *
 * Run **before** deploying the code that reads the new columns: the tenants
 * and leases contracts now require them, and a console that cannot find a
 * contracted column fails the whole tab by name.
 *
 * What it does, each step skipped when already done, so it is safe to re-run:
 *
 * 1. Creates the `settings` and `document_templates` tabs with their
 *    contract's header (the header comes from the repository, never retyped).
 * 2. Appends the new column names to the end of the tenants and leases
 *    header rows — only names that are missing, and only in row 1. No data
 *    cell is touched, so every existing row reads the new columns as blank.
 * 3. Writes each setting from `KS_SETTINGS_FILE` **that has never been saved**
 *    — a value an admin has since edited is left alone.
 * 4. Writes the built-in contract wording if the tab holds no contract blocks.
 *
 * The settings file keeps the account number and the landlord's name out of
 * the repository: they are printed on every bill, but the repo is not where
 * they live.
 */

const spreadsheetId = process.env.KS_MANSION_DB_SPREADSHEET_ID?.trim() ?? '';
const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ?? '';
const settingsFile = process.env.KS_SETTINGS_FILE?.trim() ?? '';
/**
 * Optional: ตารางตรวจเช็คอุปกรณ์หลัก transcribed as JSON — `[{ name, kind,
 * brand, roomId, position, records: [{ yearBE, doneOn: "15/11/2567" | null,
 * work }] }]`. Imported once, only into an empty equipment tab.
 */
const maintenanceFile = process.env.KS_MAINTENANCE_FILE?.trim() ?? '';
const mode = process.env.KS31_APPLY?.trim() ?? '';
const asked = mode === 'yes' || mode === 'dry-run';
const enabled = asked && spreadsheetId !== '' && credentialsJson !== '';

describe.runIf(asked && !enabled)('document templates migration configuration', () => {
  it('has everything the migration needs', () => {
    throw new Error(
      'KS31_APPLY is set but KS_MANSION_DB_SPREADSHEET_ID or GOOGLE_SERVICE_ACCOUNT_JSON came through empty; nothing was written.',
    );
  });
});

/** ~50 writes a minute, under the 60/minute/user quota. */
const WRITE_GAP_MS = 1200;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const { token } = await mintAccessToken(credentialsJson, fetch, Date.now);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${path}`,
    { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } },
  );
  if (!response.ok) {
    throw new Error(`Sheets API ${path} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

interface SheetProps {
  sheetId: number;
  title: string;
  gridProperties: { columnCount: number };
}

async function sheetProps(): Promise<SheetProps[]> {
  const meta = (await api('?fields=sheets.properties(sheetId,title,gridProperties)')) as {
    sheets: Array<{ properties: SheetProps }>;
  };
  return meta.sheets.map((s) => s.properties);
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

describe.skipIf(!enabled)('migration: editable documents', () => {
  it(
    'creates the tabs, extends the headers, and seeds settings and the contract',
    async () => {
      const client = createGoogleSheetsClient({ credentialsJson, spreadsheetId });
      const dry = mode === 'dry-run';
      const log = (line: string) => console.log(`[KS-31${dry ? ' dry-run' : ''}] ${line}`);
      let props = await sheetProps();
      const find = (tab: string) => props.find((p) => p.title.toLowerCase() === tab.toLowerCase());

      // 1. New tabs.
      for (const { tabName, contract } of [SETTINGS_TAB, DOCUMENT_TEMPLATES_TAB, EQUIPMENT_TAB_DESCRIPTOR, MAINTENANCE_LOGS_TAB_DESCRIPTOR]) {
        if (find(tabName)) {
          const header = (await client.getTabValues(tabName))[0] ?? [];
          expect(header, `"${tabName}" exists with a different header — fix by hand`).toEqual([...contract.columns]);
          log(`${tabName}: already there`);
          continue;
        }
        log(`${tabName}: create with header ${contract.columns.join(', ')}`);
        if (dry) continue;
        await api(':batchUpdate', {
          method: 'POST',
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
        });
        await client.appendRow(tabName, [...contract.columns]);
        await sleep(WRITE_GAP_MS);
      }
      props = await sheetProps();

      // 2. New columns on existing tabs: header cells only.
      for (const { tabName, contract } of [TENANTS_TAB, LEASES_TAB]) {
        const header = (await client.getTabValues(tabName))[0] ?? [];
        const missing = contract.columns.filter((column) => !header.includes(column));
        if (missing.length === 0) {
          log(`${tabName}: header already has every column`);
          continue;
        }
        log(`${tabName}: append ${missing.join(', ')}`);
        if (dry) continue;
        const sheet = find(tabName)!;
        const needed = header.length + missing.length - sheet.gridProperties.columnCount;
        if (needed > 0) {
          await api(':batchUpdate', {
            method: 'POST',
            body: JSON.stringify({
              requests: [{ appendDimension: { sheetId: sheet.sheetId, dimension: 'COLUMNS', length: needed } }],
            }),
          });
        }
        const range = `${sheet.title}!${columnLetter(header.length)}1:${columnLetter(header.length + missing.length - 1)}1`;
        await api(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
          method: 'PUT',
          body: JSON.stringify({ range, majorDimension: 'ROWS', values: [missing] }),
        });
        await sleep(WRITE_GAP_MS);
      }

      interface SeedEquipment {
        name: string;
        kind: EquipmentKind;
        brand: string;
        roomId: string | null;
        position: number;
        records: Array<{ yearBE: number; doneOn: string | null; work: string }>;
      }
      const history: SeedEquipment[] = maintenanceFile ? JSON.parse(readFileSync(maintenanceFile, 'utf8')) : [];

      if (dry) {
        log(
          maintenanceFile
            ? `would import ${history.length} equipment / ${history.reduce((n, e) => n + e.records.length, 0)} jobs if the equipment tab is empty`
            : 'no maintenance file',
        );
        log(settingsFile ? `would save settings from ${settingsFile} that are not yet stored` : 'no settings file');
        log(`would seed ${DEFAULT_CONTRACT_BLOCKS.length} contract blocks if the tab has none`);
        return;
      }

      // 3. Settings never saved before.
      const settings = createSheetsSettingsRepository(client);
      if (settingsFile) {
        const wanted = JSON.parse(readFileSync(settingsFile, 'utf8')) as Record<string, string>;
        const stored = new Set((await settings.listSettings()).map((s) => s.key));
        for (const [key, value] of Object.entries(wanted)) {
          if (stored.has(key)) {
            log(`setting ${key}: already saved, left alone`);
            continue;
          }
          await settings.saveSetting(key, value);
          log(`setting ${key}: saved`);
          await sleep(WRITE_GAP_MS);
        }
      }

      // 4. The contract wording, once.
      const templates = createSheetsDocumentTemplateRepository(client);
      if ((await templates.listBlocks('contract')).length === 0) {
        for (const block of DEFAULT_CONTRACT_BLOCKS) {
          await templates.addBlock(block);
          await sleep(WRITE_GAP_MS);
        }
        log(`contract: ${DEFAULT_CONTRACT_BLOCKS.length} blocks written`);
      } else {
        log('contract: blocks already there, left alone');
      }

      // 5. Maintenance history, once.
      const maintenance = createSheetsMaintenanceRepository(client);
      if (history.length > 0) {
        if ((await maintenance.listEquipment()).length > 0) {
          log('maintenance: equipment tab already has rows, left alone');
        } else {
          for (const seed of history) {
            const item = await maintenance.addEquipment({
              name: seed.name,
              kind: seed.kind,
              brand: seed.brand,
              roomId: seed.roomId,
              position: seed.position,
              note: '',
            });
            await sleep(WRITE_GAP_MS);
            for (const job of seed.records) {
              const doneOn = job.doneOn ? parseThaiDate(job.doneOn) : null;
              if (job.doneOn && !doneOn) throw new Error(`${seed.name}: "${job.doneOn}" is not a date`);
              await maintenance.addRecord({ equipmentId: item.id, yearBE: job.yearBE, doneOn, work: job.work, cost: null, note: '' });
              await sleep(WRITE_GAP_MS);
            }
          }
          log(`maintenance: ${history.length} equipment imported`);
        }
      }
      await maintenance.listRecords();

      // Read back through the repositories the console uses.
      await createSheetsTenantRepository(client).listTenants();
      await createSheetsLeaseRepository(client).listLeases();
      expect((await templates.listBlocks('contract')).length).toBeGreaterThan(0);
      await settings.resolveSettings();
    },
    15 * 60 * 1000,
  );
});
