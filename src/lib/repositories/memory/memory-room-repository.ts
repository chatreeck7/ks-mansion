import type { Room } from '@/lib/models/room';
import type { RoomRepository } from '../room-repository';

/**
 * Real per-room rent, taken from แบบฟอร์มเก็บเงินค่าห้อง (the collection form)
 * and cross-checked against KS_Mansion_DB. A room with no figure recorded
 * that cycle is `null`, not a guessed number — see KS-1's "don't invent
 * data" ruling. Real, current rates still arrive with KS-17.
 */
const RENT_RATE: Record<string, number | null> = {
  '101': 2636, '102': 4563, '103': 3027, '104': 3387, '105': 3211,
  '201': 2724, '202': 2747, '203': 3211, '204': 4360, '205': 2706,
  '206': null, '207': 4040, '208': 2952, '209': 3197, '210': 3141,
  '301': 3642, '302': 3746, '303': 3992, '304': 3688, '305': null,
  '306': 3900, '307': 2824, '308': 3837, '309': 3386, '310': null,
};

function unit(label: string, floor: number): Room {
  return {
    id: label,
    label,
    floor,
    kind: 'unit',
    rentRate: RENT_RATE[label] ?? null,
    hasMeter: true,
  };
}

/** Hand callers their own copy so mutations cannot reach the seed. */
function copyRoom(room: Room): Room {
  return { ...room };
}

/**
 * The registry from KS-7: 101–105, 201–210, 301–310, plus two common spaces.
 * The undercroft has no sub-meter; the laundry does and is actually rented
 * out (ค่าเช่า 3,192 — the split is lettable-vs-common, not rented-vs-not).
 */
export const SEED_ROOMS: Room[] = [
  ...Array.from({ length: 5 }, (_, i) => unit(`10${i + 1}`, 1)),
  ...Array.from({ length: 10 }, (_, i) => unit(`2${String(i + 1).padStart(2, '0')}`, 2)),
  ...Array.from({ length: 10 }, (_, i) => unit(`3${String(i + 1).padStart(2, '0')}`, 3)),
  { id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common', rentRate: 3192, hasMeter: true },
  { id: 'undercroft', label: 'ห้องใต้ถุน', floor: 0, kind: 'common', rentRate: null, hasMeter: false },
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
