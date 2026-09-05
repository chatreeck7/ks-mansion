import {
  describeDatastore,
  getLeaseRepository,
  getMeterReadingRepository,
  getRoomRepository,
  getTenantRepository,
  sheetsClientFrom,
  type DatastoreDescription,
} from './index';
import { LEASES_TAB } from './sheets/sheets-lease-repository';
import { METER_READINGS_TAB } from './sheets/sheets-meter-reading-repository';
import { ROOMS_TAB } from './sheets/sheets-room-repository';
import { TENANTS_TAB } from './sheets/sheets-tenant-repository';
import { diagnoseTab, type TabDiagnostic } from './tab-diagnostics';

/**
 * Whether each entity tab currently reads (KS-67).
 *
 * Three times a sheet/code mismatch has been found by hand — copying live
 * rows into a scratch test and running them through the parsers. Each time
 * the console *did* fail loudly and name the exact problem, which is the part
 * of the design that worked. What was missing was anywhere to see the message
 * without a developer, a terminal, and a copy of the repo.
 *
 * So this deliberately adds no diagnosis of its own. It runs the ordinary
 * read path and repeats what came back. A second opinion about what is wrong
 * with a row is a second thing to keep in step with the parsers, and it would
 * be the one that goes stale.
 */

export interface TabHealth {
  /** The sheet tab, named as it is in the spreadsheet. */
  tab: string;
  /** What a person calls these, for the screen. */
  label: string;
  status: 'ok' | 'failed';
  /**
   * Records that read back, on success. Archived rows are excluded, same as
   * every list — so this is "records the console can see", not "rows in the
   * tab", and the screen says so.
   */
  records?: number;
  /**
   * The failure, verbatim. `SheetRowError` already names the tab, the row
   * number an admin sees in the sheet, and the column; rewording it here
   * would only lose that.
   */
  error?: string;
  /**
   * Which rows the tab is not reading. Absent when the tab failed, since
   * nothing can be said about rows in a tab whose header does not parse.
   */
  rows?: TabDiagnostic;
}

export interface DatastoreHealth {
  datastore: DatastoreDescription;
  tabs: TabHealth[];
}

/**
 * One tab's read, named for the report.
 *
 * Injectable rather than hard-wired to `env` because the interesting case —
 * a tab that throws while its neighbours are fine — cannot be reached by
 * configuration alone. A rule that cannot be tested is a rule that quietly
 * stops holding.
 */
export interface TabProbe {
  tab: string;
  label: string;
  read(): Promise<{ length: number }>;
  /**
   * The row-level look at the same tab. Optional so a probe can be written
   * without one — the tests that exercise the per-tab isolation rule care
   * about failure handling, not about rows.
   */
  inspect?(): Promise<TabDiagnostic>;
}

export function repositoryProbes(env?: Record<string, unknown>): TabProbe[] {
  const client = () => sheetsClientFrom(env);

  return [
    {
      tab: 'rooms',
      label: 'ห้องพัก',
      read: () => getRoomRepository(env).listRooms(),
      inspect: () => diagnoseTab(client(), ROOMS_TAB),
    },
    {
      tab: 'tenants',
      label: 'ผู้เช่า',
      read: () => getTenantRepository(env).listTenants(),
      inspect: () => diagnoseTab(client(), TENANTS_TAB),
    },
    {
      tab: 'leases',
      label: 'สัญญาเช่า',
      read: () => getLeaseRepository(env).listLeases(),
      inspect: () => diagnoseTab(client(), LEASES_TAB),
    },
    {
      tab: 'meter_readings',
      label: 'ค่ามิเตอร์',
      read: () => getMeterReadingRepository(env).listReadings(),
      inspect: () => diagnoseTab(client(), METER_READINGS_TAB),
    },
  ];
}

export async function probeTabs(probes: TabProbe[]): Promise<TabHealth[]> {
  return Promise.all(
    probes.map(async ({ tab, label, read, inspect }): Promise<TabHealth> => {
      try {
        const records = (await read()).length;
        // Only once the tab reads: a header that does not parse has no rows
        // to say anything about, and a second failure here would just repeat
        // the first in less useful words.
        const rows = inspect ? await inspect() : undefined;
        return { tab, label, status: 'ok', records, rows };
      } catch (cause) {
        // Caught per tab, never around the whole set: a broken `leases` must
        // still report that `rooms` and `tenants` are fine. Conflating them
        // is what made the last incident read as "the console is half
        // broken" rather than "one cell is empty".
        return {
          tab,
          label,
          status: 'failed',
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    }),
  );
}

export async function checkDatastoreHealth(
  env?: Record<string, unknown>,
): Promise<DatastoreHealth> {
  return {
    datastore: describeDatastore(env),
    tabs: await probeTabs(repositoryProbes(env)),
  };
}
