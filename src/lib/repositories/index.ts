import type { RoomRepository } from './room-repository';
import type { TenantRepository } from './tenant-repository';
import type { LeaseRepository } from './lease-repository';
import type { SheetsClient } from './sheets/sheets-client';
import { sharedSeedSheets } from './memory/seed-sheet';
import { createSheetsRoomRepository } from './sheets/sheets-room-repository';
import { createSheetsTenantRepository } from './sheets/sheets-tenant-repository';
import { createSheetsLeaseRepository } from './sheets/sheets-lease-repository';
import { getSheetsClient } from './sheets/client-cache';

/**
 * Composition root for repositories. Pages and view-models import from here,
 * never from a concrete implementation — so which backing store is in use is
 * decided in this file and nowhere else.
 *
 * Sheets-backed either way (KS-69): with credentials the client talks to
 * Google, without them it talks to an in-memory spreadsheet seeded with
 * sample data. Only the *client* changes, so local dev runs the same
 * repository code as production — the same parsing, the same validation, the
 * same refusal to write a row that could not be read back. There is no
 * second implementation left to drift.
 *
 * The fallback is what keeps `npm run dev` and the test suite working with no
 * Google account, and it is safe here in a way it would not be for auth: the
 * seeds are sample data, so falling back exposes nothing. Auth deliberately
 * does the opposite and fails closed — see src/middleware.ts.
 *
 * The client is reused across requests so its access-token cache actually
 * hits; repositories themselves are cheap and stateless, so a new one per
 * request is fine and keeps reads un-cached (see KS-55 / docs/data-layer.md).
 */
export function sheetsClientFrom(env?: Record<string, unknown>): SheetsClient {
  const credentialsJson = String(env?.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim();
  const spreadsheetId = String(env?.SHEETS_SPREADSHEET_ID ?? '').trim();
  if (!credentialsJson || !spreadsheetId) return sharedSeedSheets();
  return getSheetsClient(credentialsJson, spreadsheetId);
}

/**
 * Which store the functions below would return, and why — for the health
 * page (KS-67).
 *
 * The fallback above is deliberate and useful, but it is also silent: a
 * console showing seed data and a console that cannot reach the sheet look
 * identical from the outside. Before this, the only tell was whether the
 * undercroft read ห้องเช่าส่วนกลาง or ห้องใต้ถุน — folklore, not a diagnostic.
 *
 * Reports the *reason* rather than just the outcome, because the two ways to
 * end up on seed data need different fixes: a missing credential is a
 * deployment problem, a missing spreadsheet id is a configuration one.
 */
export interface DatastoreDescription {
  backend: 'sheets' | 'memory';
  /**
   * How the store identifies itself, for display. Null on the seed store,
   * which has nothing to point at.
   */
  sourceId: string | null;
  /**
   * Where an admin opens the store to edit it by hand. Built here rather
   * than by the page: only this layer knows what `sourceId` addresses, and a
   * page that assembles a Google URL is a page that has to be rewritten when
   * the store changes — which is the whole thing the boundary rule prevents.
   */
  sourceUrl: string | null;
  /**
   * Config the Sheets store needed and did not get, named as the deployment
   * names it. Empty when nothing is missing.
   *
   * Reported as *which* rather than just "misconfigured" because the two
   * cases need different fixes: an absent credential is a deployment
   * problem, an absent id a configuration one.
   */
  missingConfig: string[];
}

export function describeDatastore(env?: Record<string, unknown>): DatastoreDescription {
  const credentials = String(env?.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim();
  const spreadsheetId = String(env?.SHEETS_SPREADSHEET_ID ?? '').trim();

  const missingConfig = [
    credentials ? null : 'GOOGLE_SERVICE_ACCOUNT_JSON',
    spreadsheetId ? null : 'SHEETS_SPREADSHEET_ID',
  ].filter((name): name is string => name !== null);

  if (missingConfig.length > 0) {
    return { backend: 'memory', sourceId: null, sourceUrl: null, missingConfig };
  }

  return {
    backend: 'sheets',
    // Not a secret — it is already in the sheet's own URL, and the console
    // is behind admin auth either way.
    sourceId: spreadsheetId,
    sourceUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    missingConfig: [],
  };
}

export function getRoomRepository(env?: Record<string, unknown>): RoomRepository {
  return createSheetsRoomRepository(sheetsClientFrom(env));
}

export function getTenantRepository(env?: Record<string, unknown>): TenantRepository {
  return createSheetsTenantRepository(sheetsClientFrom(env));
}

export function getLeaseRepository(env?: Record<string, unknown>): LeaseRepository {
  return createSheetsLeaseRepository(sheetsClientFrom(env));
}
