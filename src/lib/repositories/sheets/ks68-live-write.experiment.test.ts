import { beforeAll, describe, expect, it } from 'vitest';
import { formatThaiDate } from '@/lib/format/thai';
import { createGoogleSheetsClient, mintAccessToken } from './google-sheets-client';
import { createSheetsMeterReadingRepository } from './sheets-meter-reading-repository';
import type { SheetsClient } from './sheets-client';

/**
 * KS-68 item 1: the destructive experiment the KS-52 spike asked for, run
 * against a **throwaway copy** of the spreadsheet.
 *
 * Skipped by default and in CI. It only runs when both env vars below are
 * set, so `npm test` on an ordinary checkout is unaffected.
 *
 *   KS68_SCRATCH_SPREADSHEET_ID=<the copy's id> \
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
 *   npx vitest run src/lib/repositories/sheets/ks68-live-write.experiment.test.ts
 *
 * **No manual setup.** The `ks68 scratch` tab — named with a **space**, which
 * is the point — is created by `beforeAll` if it is missing. The only
 * prerequisite is the `meter_readings` tab, which the copy already carries.
 *
 * These tests append rows and overwrite them. They never touch `rooms`,
 * `tenants` or `leases`, but the scratch tab is left dirty on purpose: the
 * rows are the evidence. Delete the copy when the card closes.
 *
 * Each test states an assumption the codebase already relies on. The point is
 * not that they pass — it is that if the real API behaves differently from
 * the in-memory fake every other test runs against, one of them fails and
 * says which assumption was wrong.
 */

/**
 * The live spreadsheet, refused by id.
 *
 * The scratch id is read from a **differently named** variable to the
 * production one for the same reason: an experiment that writes junk rows
 * must not be able to pick up a deployment's configuration by accident.
 */
const PRODUCTION_SPREADSHEET_ID = '1Nn8UgvHbhpxuN54Crou-uldGKcYQWVQcwCigVscSaDo';

/** Deliberately contains a space — see the tab-name test below. */
const SCRATCH_TAB = 'ks68 scratch';
const SCRATCH_HEADER_ROWS = 1;

const spreadsheetId = process.env.KS68_SCRATCH_SPREADSHEET_ID?.trim() ?? '';
const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ?? '';
const enabled = spreadsheetId !== '' && credentialsJson !== '';

/** A tag that makes this run's rows findable in the sheet afterwards. */
const runTag = `ks68-${Date.now()}`;

describe.skipIf(!enabled)('KS-68 — live write experiment (throwaway sheet)', () => {
  let client: SheetsClient;

  beforeAll(async () => {
    if (spreadsheetId === PRODUCTION_SPREADSHEET_ID) {
      throw new Error(
        'KS68_SCRATCH_SPREADSHEET_ID is the live KS_Mansion_DB. This suite writes junk ' +
          'rows and overwrites others — point it at a copy.',
      );
    }
    client = createGoogleSheetsClient({ credentialsJson, spreadsheetId });
    await ensureScratchTab();
  });

  /**
   * Creates the scratch tab and its header if they are not there yet.
   *
   * Idempotent, so a second run of the suite is not a second setup. Uses
   * `batchUpdate` directly rather than through `SheetsClient`, which offers
   * no way to create a tab on purpose: the console never invents tabs, and
   * this is setup for an experiment rather than something the app does.
   */
  async function ensureScratchTab(): Promise<void> {
    try {
      const rows = await client.getTabValues(SCRATCH_TAB);
      if (rows.length >= SCRATCH_HEADER_ROWS) return;
    } catch {
      // Absent, or unreadable under the bare range form — either way, try to
      // create it. A tab that already exists comes back as an error below,
      // which is the signal that the *read* is what failed, not the tab.
    }

    const { token } = await mintAccessToken(credentialsJson, fetch, Date.now);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: SCRATCH_TAB } } }],
        }),
      },
    );

    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      // A tab that is already there is fine; anything else is not.
      if (!body.includes('already exists')) {
        throw new Error(`Could not create the "${SCRATCH_TAB}" tab (${response.status}): ${body}`);
      }
    }

    await client.appendRow(SCRATCH_TAB, ['id', 'note']);
  }

  /**
   * The baseline, and the one that proves `valueInputOption=RAW` against the
   * real API rather than against a fake that cannot reinterpret anything.
   *
   * A พ.ศ. date is the case that matters: `USER_ENTERED` would parse
   * `26 มี.ค. 2568` on the way in and hand back something else, and nothing
   * in the read path would catch it because the result is still a string.
   */
  it('writes a row and reads it back unchanged, Buddhist-era date included', async () => {
    const thaiDate = formatThaiDate(new Date(2025, 2, 26));
    const id = `${runTag}-baseline`;

    await client.appendRow(SCRATCH_TAB, [id, thaiDate]);
    const rows = await client.getTabValues(SCRATCH_TAB);

    const written = rows.find((row) => row[0] === id);
    expect(written).toBeDefined();
    // Byte-identical, not merely parseable back to the same date.
    expect(written?.[1]).toBe(thaiDate);
  });

  /**
   * The question left open by KS-66's review, and the reason this tab's name
   * has a space in it.
   *
   * `getTabValues` passes the tab name **bare** as the A1 range;
   * `appendRow` / `updateRow` pass it **quoted** through `a1Tab`. Both forms
   * have to work on a name containing a space, or the two paths disagree
   * about which tabs are addressable — latent today because nothing is named
   * this way, and exactly the kind of thing that surfaces the day someone
   * renames a tab.
   *
   * A failure here is the answer, not a defect: whichever call throws names
   * the form to standardise on.
   */
  it('addresses a tab whose name contains a space, from both the read and write path', async () => {
    const id = `${runTag}-spaced-tab`;

    // The quoted form.
    await expect(client.appendRow(SCRATCH_TAB, [id, 'quoted range'])).resolves.toBeUndefined();

    // The bare form.
    const rows = await client.getTabValues(SCRATCH_TAB);
    expect(rows.some((row) => row[0] === id)).toBe(true);
  });

  /**
   * The spike's real fear, in the shape this client can actually produce: a
   * write the API accepts while quietly dropping part of it.
   *
   * There is no `batchUpdate` with sub-requests here — `values.append` is one
   * call for one row — so partial success cannot arise the way the spike
   * framed it. What can still happen is a row wider than the tab's declared
   * columns being truncated at the edge and reported as written. Every
   * repository builds rows from the header, so a silent truncation would lose
   * whichever column happened to be last.
   */
  it('does not silently drop cells from a row wider than the tab', async () => {
    const id = `${runTag}-wide`;
    const beyondHeader = 'past the last header column';

    await client.appendRow(SCRATCH_TAB, [id, 'note', beyondHeader]);
    const rows = await client.getTabValues(SCRATCH_TAB);

    const written = rows.find((row) => row[0] === id);
    expect(written).toBeDefined();
    // If this fails, the API truncated to the header width and said nothing —
    // which would mean writes must be clipped to the header deliberately
    // rather than trusted to round-trip.
    expect(written?.[2]).toBe(beyondHeader);
  });

  /**
   * `updateRow` addresses a row by number. Writing past the end of the tab is
   * a bug in the caller, and the in-memory fake throws on it — so the real
   * client must not quietly pad the sheet with blank rows instead, or local
   * tests would be proving something production does not do.
   */
  it('refuses an update aimed past the end of the tab, the way the fake does', async () => {
    const rows = await client.getTabValues(SCRATCH_TAB);
    const wellPastTheEnd = rows.length + 500;

    await expect(client.updateRow(SCRATCH_TAB, wellPastTheEnd, ['x', 'y'])).rejects.toThrow();
  });

  /**
   * What re-find-before-write is actually buying, measured rather than
   * asserted in a comment.
   *
   * There is no compare-and-swap in the Sheets API. A row number remembered
   * from an earlier read addresses a *position*, not a record, and an admin
   * inserting a row shifts every number below it. This writes to a stale
   * number on purpose and shows the neighbour being overwritten — the damage
   * mode `findRow` exists to keep to one round trip instead of one session.
   */
  it('overwrites the wrong record when given a stale row number', async () => {
    const first = `${runTag}-neighbour`;
    const second = `${runTag}-mover`;

    await client.appendRow(SCRATCH_TAB, [first, 'must not be lost']);
    await client.appendRow(SCRATCH_TAB, [second, 'the record being updated']);

    const before = await client.getTabValues(SCRATCH_TAB);
    const firstIndex = before.findIndex((row) => row[0] === first);
    expect(firstIndex).toBeGreaterThanOrEqual(SCRATCH_HEADER_ROWS);

    // The number `second` *would* have had, had `first` not been there.
    const staleRowNumber = firstIndex + 1;
    await client.updateRow(SCRATCH_TAB, staleRowNumber, [second, 'written to a stale position']);

    const after = await client.getTabValues(SCRATCH_TAB);
    // The neighbour is gone: a stale row number destroys an unrelated record
    // and the API reports success either way.
    expect(after.some((row) => row[0] === first)).toBe(false);
    expect(after.filter((row) => row[0] === second)).toHaveLength(2);
  });

  /**
   * The first meter reading ever written to a real spreadsheet — KS-18's
   * whole path end to end: draft → validated row → append → read back →
   * `latestReading`.
   *
   * Goes through the repository rather than the client, because the thing
   * being proved is that the parse-before-write guard and the พ.ศ. date
   * handling hold against the API, not that a row can be appended.
   */
  it('records a meter reading through the repository and reads it back', async () => {
    const readings = createSheetsMeterReadingRepository(client);
    const readDate = new Date(2025, 2, 26);

    const recorded = await readings.recordReading({
      roomId: 'laundry',
      meterType: 'water',
      readDate,
      previousReading: 786,
      currentReading: 816,
      ratePerUnit: 15,
      note: runTag,
    });

    expect(recorded.id).toMatch(/^m-\d+$/);

    const readBack = await readings.getReading(recorded.id);
    expect(readBack).toMatchObject({
      roomId: 'laundry',
      meterType: 'water',
      previousReading: 786,
      currentReading: 816,
      ratePerUnit: 15,
    });
    // The date survived RAW input and parsed back to the day it means.
    expect(readBack?.readDate).toEqual(readDate);

    // And the round would continue from it.
    expect(await readings.latestReading('laundry', 'water')).toMatchObject({ currentReading: 816 });
  });

  /**
   * The rule that keeps a bad row from ever reaching the sheet. Proved live
   * because the guard runs by *parsing the row it is about to write* — and
   * the whole point is that the parser and the API agree about what a row is.
   */
  it('refuses to write a reading it could not read back, and writes nothing', async () => {
    const readings = createSheetsMeterReadingRepository(client);
    const before = (await readings.listReadings()).length;

    await expect(
      readings.recordReading({
        roomId: 'laundry',
        meterType: 'water',
        readDate: new Date(2025, 2, 26),
        previousReading: 900,
        currentReading: 800,
        ratePerUnit: 15,
        note: runTag,
      }),
    ).rejects.toThrow(/does not run backwards/);

    expect((await readings.listReadings()).length).toBe(before);
  });
});
