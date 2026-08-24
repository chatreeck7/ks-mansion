import type { RoomRepository } from './room-repository';
import { createMemoryRoomRepository } from './memory/memory-room-repository';

/**
 * Composition root for repositories. Pages and view-models import from here,
 * never from a concrete implementation — so swapping the in-memory store for
 * the Sheets-backed one changes this file and nothing else.
 *
 * Still memory-backed: `sheets/sheets-room-repository.ts` implements the
 * Sheets adapter (KS-54) but has no real `SheetsClient` to inject yet — that
 * requires a service account + credentials, which is KS-2's scope. Swapping
 * in `createSheetsRoomRepository(googleSheetsClient)` here is the one-file
 * change once KS-2 lands.
 */
export function getRoomRepository(): RoomRepository {
  return createMemoryRoomRepository();
}
