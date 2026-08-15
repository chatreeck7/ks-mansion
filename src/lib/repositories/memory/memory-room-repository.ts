import type { Room } from '@/lib/models/room';
import type { RoomRepository } from '../room-repository';

/** Fixture rates. Real values arrive with KS-17. */
const RATE_BY_FLOOR: Record<number, number> = { 1: 2600, 2: 2800, 3: 3000 };

function unit(label: string, floor: number): Room {
  return {
    id: label,
    label,
    floor,
    kind: 'lettable',
    rentRate: RATE_BY_FLOOR[floor] ?? 2600,
    hasMeter: true,
  };
}

/** Hand callers their own copy so mutations cannot reach the seed. */
function copyRoom(room: Room): Room {
  return { ...room };
}

/**
 * The registry from KS-7: 101–105, 201–210, 301–310, plus two common spaces.
 * The undercroft has no sub-meter; the laundry does.
 */
export const SEED_ROOMS: Room[] = [
  ...Array.from({ length: 5 }, (_, i) => unit(`10${i + 1}`, 1)),
  ...Array.from({ length: 10 }, (_, i) => unit(`2${String(i + 1).padStart(2, '0')}`, 2)),
  ...Array.from({ length: 10 }, (_, i) => unit(`3${String(i + 1).padStart(2, '0')}`, 3)),
  { id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common', hasMeter: true },
  { id: 'undercroft', label: 'ห้องใต้ถุน', floor: 0, kind: 'common', hasMeter: false },
];

export function createMemoryRoomRepository(rooms: Room[] = SEED_ROOMS): RoomRepository {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  return {
    async listRooms() {
      return rooms.map(copyRoom);
    },
    async getRoom(id: string) {
      const room = byId.get(id);
      return room ? copyRoom(room) : null;
    },
  };
}
