import type { RoomRepository } from './room-repository';
import { createMemoryRoomRepository } from './memory/memory-room-repository';
import { createSheetsRoomRepository } from './sheets/sheets-room-repository';
import { createGoogleSheetsClient } from './sheets/google-sheets-client';

/**
 * Composition root for repositories. Pages and view-models import from here,
 * never from a concrete implementation — so which backing store is in use is
 * decided in this file and nowhere else.
 *
 * Sheets-backed when the credentials are configured, in-memory otherwise.
 * That fallback is what keeps `npm run dev` and the test suite working with
 * no Google account, and it is safe here in a way it would not be for auth:
 * the seed is public sample data, so falling back exposes nothing. Auth
 * deliberately does the opposite and fails closed — see src/middleware.ts.
 */
export function getRoomRepository(env?: Record<string, unknown>): RoomRepository {
  const credentialsJson = String(env?.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim();
  const spreadsheetId = String(env?.SHEETS_SPREADSHEET_ID ?? '').trim();

  if (!credentialsJson || !spreadsheetId) return createMemoryRoomRepository();

  return createSheetsRoomRepository(
    createGoogleSheetsClient({ credentialsJson, spreadsheetId }),
  );
}
