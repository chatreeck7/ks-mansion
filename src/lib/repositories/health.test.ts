import { describe, expect, it } from 'vitest';
import { SheetRowError } from './sheets/tab-reader';
import { checkDatastoreHealth, probeTabs, type TabProbe } from './health';
import { describeDatastore } from './index';

const SHEETS_ENV = {
  GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"a@b.iam.gserviceaccount.com"}',
  SHEETS_SPREADSHEET_ID: '1AbC',
};

function probe(tab: string, read: TabProbe['read']): TabProbe {
  return { tab, label: tab, read };
}

const ok = (n: number) => () => Promise.resolve({ length: n });
const fails = (error: Error) => () => Promise.reject(error);

describe('describeDatastore', () => {
  it('reports Sheets, with somewhere an admin can open, when fully configured', () => {
    expect(describeDatastore(SHEETS_ENV)).toEqual({
      backend: 'sheets',
      sourceId: '1AbC',
      sourceUrl: 'https://docs.google.com/spreadsheets/d/1AbC/edit',
      missingConfig: [],
    });
  });

  it('falls back to memory with nothing configured', () => {
    expect(describeDatastore({})).toMatchObject({
      backend: 'memory',
      sourceId: null,
      sourceUrl: null,
    });
  });

  /**
   * The two ways to land on seed data need different fixes — a missing
   * credential is a deployment problem, a missing id a configuration one —
   * so reporting only "memory" would send someone looking in the wrong place.
   */
  it('names which config is missing, not just that some is', () => {
    expect(describeDatastore({ SHEETS_SPREADSHEET_ID: '1AbC' }).missingConfig).toEqual([
      'GOOGLE_SERVICE_ACCOUNT_JSON',
    ]);

    expect(
      describeDatastore({ GOOGLE_SERVICE_ACCOUNT_JSON: SHEETS_ENV.GOOGLE_SERVICE_ACCOUNT_JSON })
        .missingConfig,
    ).toEqual(['SHEETS_SPREADSHEET_ID']);

    expect(describeDatastore({}).missingConfig).toEqual([
      'GOOGLE_SERVICE_ACCOUNT_JSON',
      'SHEETS_SPREADSHEET_ID',
    ]);
  });

  it('treats whitespace as unset rather than as a value', () => {
    expect(
      describeDatastore({ GOOGLE_SERVICE_ACCOUNT_JSON: '   ', SHEETS_SPREADSHEET_ID: '  ' }),
    ).toMatchObject({
      backend: 'memory',
      missingConfig: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'SHEETS_SPREADSHEET_ID'],
    });
  });

  /**
   * The page links to this. A half-configured store that still handed back a
   * URL would send an admin to a spreadsheet the console is not reading.
   */
  it('offers no source to open when it is not actually on Sheets', () => {
    expect(describeDatastore({ SHEETS_SPREADSHEET_ID: '1AbC' }).sourceUrl).toBeNull();
  });
});

describe('probeTabs', () => {
  it('reports the record count for a tab that reads', async () => {
    const [rooms] = await probeTabs([probe('rooms', ok(27))]);
    expect(rooms).toMatchObject({ tab: 'rooms', status: 'ok', records: 27 });
  });

  /**
   * The distinction that made the last incident read as "the console is half
   * broken" rather than "one cell is empty". One bad tab must not take the
   * others' results down with it.
   */
  it('does not let one failing tab hide the tabs that are fine', async () => {
    const results = await probeTabs([
      probe('rooms', ok(27)),
      probe('leases', fails(new SheetRowError('leases', 2, '"occupant_count" is not a number: ""'))),
      probe('tenants', ok(14)),
    ]);

    expect(results.map((r) => [r.tab, r.status])).toEqual([
      ['rooms', 'ok'],
      ['leases', 'failed'],
      ['tenants', 'ok'],
    ]);
    expect(results[0]!.records).toBe(27);
    expect(results[2]!.records).toBe(14);
  });

  /**
   * The message is the product. It already names the tab, the row number an
   * admin sees in the sheet, and the column — summarising it here would
   * throw away the only part that tells someone what to go and fix.
   */
  it('passes the error through verbatim, row number and column intact', async () => {
    const [leases] = await probeTabs([
      probe('leases', fails(new SheetRowError('leases', 2, '"occupant_count" is not a number: ""'))),
    ]);

    expect(leases!.error).toBe(
      'Sheets tab "leases", row 2: "occupant_count" is not a number: ""',
    );
    expect(leases!.records).toBeUndefined();
  });

  it('survives a throw that is not an Error', async () => {
    const [rooms] = await probeTabs([probe('rooms', () => Promise.reject('sheet exploded'))]);
    expect(rooms).toMatchObject({ status: 'failed', error: 'sheet exploded' });
  });
});

describe('checkDatastoreHealth', () => {
  it('reports every entity tab against the in-memory seeds', async () => {
    const health = await checkDatastoreHealth({});

    expect(health.datastore.backend).toBe('memory');
    expect(health.tabs.map((t) => t.tab)).toEqual([
      'rooms',
      'tenants',
      'leases',
      'meter_readings',
    ]);
    // Seeds must round-trip through the real parsers, or local dev is
    // demonstrating something production would reject.
    expect(health.tabs.every((t) => t.status === 'ok')).toBe(true);
  });
});
