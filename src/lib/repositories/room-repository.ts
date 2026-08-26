import type { Room } from '@/lib/models/room';

/**
 * Rooms are editable but not creatable. The building has the rooms it has —
 * 101–105, 201–210, 301–310 and two common spaces — and a console that can
 * conjure a room 311 into existence offers nothing except a way to corrupt
 * the registry every bill and meter round is keyed to. Adding a genuinely new
 * space is a deliberate act, done in the sheet.
 */
export type RoomEdit = Pick<Room, 'label' | 'status' | 'rentRate' | 'hasMeter' | 'appliances'>;

export interface RoomRepository {
  /** Excludes archived rooms. */
  listRooms(): Promise<Room[]>;
  /** Returns an archived room too, so its lease history stays reachable. */
  getRoom(id: string): Promise<Room | null>;

  updateRoom(id: string, changes: Partial<RoomEdit>): Promise<Room>;
  archiveRoom(id: string): Promise<Room>;
}
