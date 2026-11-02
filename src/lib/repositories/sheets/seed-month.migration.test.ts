import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activeLeaseFor, type Lease } from '@/lib/models/lease';
import { planSeed, type SeedDataset } from '@/lib/seed/seed-plan';
import { createGoogleSheetsClient, mintAccessToken } from './google-sheets-client';
import { BILLS_TAB, createSheetsBillRepository } from './sheets-bill-repository';
import { createSheetsLeaseRepository, LEASES_TAB } from './sheets-lease-repository';
import {
  createSheetsMeterReadingRepository,
  METER_READINGS_TAB,
} from './sheets-meter-reading-repository';
import { createSheetsPaymentRepository, PAYMENTS_TAB } from './sheets-payment-repository';
import { createSheetsRoomRepository } from './sheets-room-repository';
import { createSheetsTenantRepository, TENANTS_TAB } from './sheets-tenant-repository';

/**
 * Replaces the spreadsheet's test rows with one real month (the move onto
 * the console).
 *
 * Run by hand, once, against a dataset built from the month's paperwork. The
 * dataset is a JSON file **outside the repository** — it holds tenants'
 * phone numbers — and is checked by `planSeed` before anything is touched:
 *
 *   KS_MANSION_DB_SPREADSHEET_ID=<the live id> \
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
 *   KS_SEED_FILE=/path/to/ks-2569-10.json \
 *   KS_SEED_APPLY=dry-run \            # or `yes` to write
 *   npx vitest run src/lib/repositories/sheets/seed-month.migration.test.ts
 *
 * - `dry-run` reads the live rooms and checks the dataset against them;
 *   it writes nothing.
 * - `yes` clears the data rows (never the header) of tenants, leases,
 *   meter_readings, bills and payments, edits the rooms in place, then
 *   writes everything **through the repositories** — so every row passes
 *   the same parse-before-write guard a console save does, and ids come
 *   from the same `nextId`.
 * - It refuses to clear a tab holding any id outside `DISPOSABLE_IDS` (the
 *   known test rows, plus whatever an earlier run of this seed wrote)
 *   unless `KS_SEED_FORCE=yes`. Once admins start recording real payments,
 *   re-running this must not be able to quietly erase them.
 * - Writes are paced under the Sheets API's per-minute write quota.
 */

const spreadsheetId = process.env.KS_MANSION_DB_SPREADSHEET_ID?.trim() ?? '';
const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ?? '';
const seedFile = process.env.KS_SEED_FILE?.trim() ?? '';
const mode = process.env.KS_SEED_APPLY?.trim() ?? '';
const force = process.env.KS_SEED_FORCE?.trim() === 'yes';
const asked = mode === 'yes' || mode === 'dry-run';
const enabled = asked && spreadsheetId !== '' && credentialsJson !== '' && seedFile !== '';

/** The test rows the sheet was built with — safe to delete. */
const TEST_IDS = new Set(['t-001', 'l-001', 'm-001', 'b-001', 'b-002', 'p-001', 'p-002']);

/** Tabs this seed empties, in the order they are cleared (dependents first). */
const CLEARED_TABS = [PAYMENTS_TAB, BILLS_TAB, METER_READINGS_TAB, LEASES_TAB, TENANTS_TAB];

/** ~50 writes a minute, under the 60/minute/user quota. */
const WRITE_GAP_MS = 1200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.runIf(asked && !enabled)('seed configuration', () => {
  it('has everything the seed needs', () => {
    const missing = [
      spreadsheetId === '' ? 'KS_MANSION_DB_SPREADSHEET_ID' : null,
      credentialsJson === '' ? 'GOOGLE_SERVICE_ACCOUNT_JSON' : null,
      seedFile === '' ? 'KS_SEED_FILE' : null,
    ].filter((name): name is string => name !== null);
    throw new Error(`KS_SEED_APPLY is set but ${missing.join(', ')} came through empty; nothing was written.`);
  });
});

async function sheetsApi(path: string, init?: RequestInit): Promise<unknown> {
  const { token } = await mintAccessToken(credentialsJson, fetch, Date.now);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${path}`,
    {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    },
  );
  if (!response.ok) {
    throw new Error(`Sheets API ${path} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

interface SheetProps {
  sheetId: number;
  title: string;
}

/** Deletes every row below the header — rows, not just values, so no blank band is left. */
async function clearDataRows(tabName: string, rowCount: number, sheets: SheetProps[]): Promise<void> {
  if (rowCount <= 1) return;
  const sheet = sheets.find((s) => s.title.toLowerCase() === tabName.toLowerCase());
  if (!sheet) throw new Error(`No "${tabName}" tab in this spreadsheet.`);
  await sheetsApi(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: { sheetId: sheet.sheetId, dimension: 'ROWS', startIndex: 1, endIndex: rowCount },
          },
        },
      ],
    }),
  });
}

describe.skipIf(!enabled)(`seed: ${seedFile}`, () => {
  it(
    'replaces the test rows with the month, and reads it all back',
    async () => {
      const dataset = JSON.parse(readFileSync(seedFile, 'utf8')) as SeedDataset;
      const client = createGoogleSheetsClient({ credentialsJson, spreadsheetId });
      const rooms = createSheetsRoomRepository(client);
      const tenants = createSheetsTenantRepository(client);
      const leases = createSheetsLeaseRepository(client);
      const readings = createSheetsMeterReadingRepository(client);
      const bills = createSheetsBillRepository(client);
      const payments = createSheetsPaymentRepository(client);

      const liveRooms = await rooms.listRooms();
      const plan = planSeed(dataset, liveRooms.map((room) => room.id));

      // What would be deleted, and whether any of it is not ours to delete.
      const existing = new Map<string, string[][]>();
      const foreign: string[] = [];
      for (const { tabName } of CLEARED_TABS) {
        const values = await client.getTabValues(tabName);
        existing.set(tabName, values);
        const idIndex = values[0]?.indexOf('id') ?? -1;
        for (const row of values.slice(1)) {
          const id = row[idIndex]?.trim() ?? '';
          if (id && !TEST_IDS.has(id) && !(process.env.KS_SEED_RESEED === 'yes')) {
            foreign.push(`${tabName}:${id}`);
          }
        }
      }

      console.log(
        `[seed] ${dataset.label}: ${plan.roomChanges.length} rooms, ${plan.tenancies.length} tenancies, ` +
          `${plan.readings.length} readings, ${plan.bills.length} bills, total ${plan.billTotal}`,
      );
      console.log(
        `[seed] would clear: ${[...existing].map(([tab, v]) => `${tab} ${Math.max(v.length - 1, 0)} rows`).join(', ')}`,
      );
      if (foreign.length > 0) console.log(`[seed] rows that are not test data: ${foreign.join(', ')}`);

      if (mode === 'dry-run') return;

      expect(
        foreign.length === 0 || force,
        `Refusing to clear rows that are not the known test data: ${foreign.join(', ')}. ` +
          `If this is a deliberate re-seed, set KS_SEED_FORCE=yes.`,
      ).toBe(true);

      const meta = (await sheetsApi('?fields=sheets.properties(sheetId,title)')) as {
        sheets: Array<{ properties: SheetProps }>;
      };
      const sheetProps = meta.sheets.map((s) => s.properties);
      for (const { tabName } of CLEARED_TABS) {
        // The grid can be taller than its values; delete by values read, plus nothing above.
        await clearDataRows(tabName, existing.get(tabName)!.length, sheetProps);
        await sleep(WRITE_GAP_MS);
      }

      for (const { id, changes } of plan.roomChanges) {
        await rooms.updateRoom(id, changes);
        await sleep(WRITE_GAP_MS);
      }

      const created: Lease[] = [];
      for (const tenancy of plan.tenancies) {
        const tenant = await tenants.createTenant(tenancy.tenant);
        await sleep(WRITE_GAP_MS);
        created.push(await leases.createLease({ ...tenancy.lease, tenantId: tenant.id }));
        await sleep(WRITE_GAP_MS);
      }

      for (const reading of plan.readings) {
        await readings.recordReading(reading);
        await sleep(WRITE_GAP_MS);
      }

      for (const bill of plan.bills) {
        const lease = activeLeaseFor(
          created.filter((l) => l.roomId === bill.roomId),
          bill.issueDate,
        );
        await bills.issueBill({ ...bill, leaseId: lease?.id ?? null });
        await sleep(WRITE_GAP_MS);
      }

      // Read back through the repositories: a pass means the console can use it.
      expect(await tenants.listTenants()).toHaveLength(plan.tenancies.length);
      expect(await leases.listLeases()).toHaveLength(plan.tenancies.length);
      expect(await readings.listReadings()).toHaveLength(plan.readings.length);
      expect(await payments.listPayments()).toEqual([]);
      const issued = await bills.listBills();
      expect(issued).toHaveLength(plan.bills.length);
      expect(
        issued.reduce((sum, b) => sum + b.rentAmount + b.electricityAmount + b.waterAmount, 0),
      ).toBe(dataset.expectedBillTotal);
      const after = await rooms.listRooms();
      for (const { id, changes } of plan.roomChanges) {
        expect(after.find((room) => room.id === id)?.status, `room ${id}`).toBe(changes.status);
      }
    },
    15 * 60 * 1000,
  );
});
