import type { RoomRepository } from './room-repository';
import { createMemoryRoomRepository } from './memory/memory-room-repository';

/**
 * Composition root for repositories. Pages and view-models import from here,
 * never from a concrete implementation — so swapping the in-memory store for
 * the Sheets-backed one changes this file and nothing else.
 */
export function getRoomRepository(): RoomRepository {
  return createMemoryRoomRepository();
}
