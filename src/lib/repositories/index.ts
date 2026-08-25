import type { RoomRepository } from './room-repository';
import type { TenantRepository } from './tenant-repository';
import type { LeaseRepository } from './lease-repository';
import type { SheetsClient } from './sheets/sheets-client';
import { createMemoryRoomRepository } from './memory/memory-room-repository';
import { createMemoryTenantRepository } from './memory/memory-tenant-repository';
import { createMemoryLeaseRepository } from './memory/memory-lease-repository';
import { createSheetsRoomRepository } from './sheets/sheets-room-repository';
import { createSheetsTenantRepository } from './sheets/sheets-tenant-repository';
import { createSheetsLeaseRepository } from './sheets/sheets-lease-repository';
import { getSheetsClient } from './sheets/client-cache';

/**
 * Composition root for repositories. Pages and view-models import from here,
 * never from a concrete implementation — so which backing store is in use is
 * decided in this file and nowhere else.
 *
 * Sheets-backed when the credentials are configured, in-memory otherwise.
 * That fallback is what keeps `npm run dev` and the test suite working with
 * no Google account, and it is safe here in a way it would not be for auth:
 * the seeds are sample data, so falling back exposes nothing. Auth
 * deliberately does the opposite and fails closed — see src/middleware.ts.
 *
 * The client is reused across requests so its access-token cache actually
 * hits; repositories themselves are cheap and stateless, so a new one per
 * request is fine and keeps reads un-cached (see KS-55 / docs/data-layer.md).
 */
function sheetsClientFrom(env?: Record<string, unknown>): SheetsClient | null {
  const credentialsJson = String(env?.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim();
  const spreadsheetId = String(env?.SHEETS_SPREADSHEET_ID ?? '').trim();
  if (!credentialsJson || !spreadsheetId) return null;
  return getSheetsClient(credentialsJson, spreadsheetId);
}

export function getRoomRepository(env?: Record<string, unknown>): RoomRepository {
  const client = sheetsClientFrom(env);
  return client ? createSheetsRoomRepository(client) : createMemoryRoomRepository();
}

export function getTenantRepository(env?: Record<string, unknown>): TenantRepository {
  const client = sheetsClientFrom(env);
  return client ? createSheetsTenantRepository(client) : createMemoryTenantRepository();
}

export function getLeaseRepository(env?: Record<string, unknown>): LeaseRepository {
  const client = sheetsClientFrom(env);
  return client ? createSheetsLeaseRepository(client) : createMemoryLeaseRepository();
}
