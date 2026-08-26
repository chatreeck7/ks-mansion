import {
  describeDatastore,
  getLeaseRepository,
  getRoomRepository,
  getTenantRepository,
  type DatastoreDescription,
} from './index';

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
}

export function repositoryProbes(env?: Record<string, unknown>): TabProbe[] {
  return [
    { tab: 'rooms', label: 'ห้องพัก', read: () => getRoomRepository(env).listRooms() },
    { tab: 'tenants', label: 'ผู้เช่า', read: () => getTenantRepository(env).listTenants() },
    { tab: 'leases', label: 'สัญญาเช่า', read: () => getLeaseRepository(env).listLeases() },
  ];
}

export async function probeTabs(probes: TabProbe[]): Promise<TabHealth[]> {
  return Promise.all(
    probes.map(async ({ tab, label, read }): Promise<TabHealth> => {
      try {
        return { tab, label, status: 'ok', records: (await read()).length };
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
