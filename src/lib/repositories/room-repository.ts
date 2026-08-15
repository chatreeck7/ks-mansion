import type { Room } from '@/lib/models/room';

/**
 * Every feature reads rooms through this. Implementations live under
 * src/lib/repositories/<backend>/ and are the only code allowed to know
 * where rooms are actually stored.
 */
export interface RoomRepository {
  listRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | null>;
}
