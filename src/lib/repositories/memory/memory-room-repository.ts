import type { Room, RoomStatus } from '@/lib/models/room';
import type { RoomRepository } from '../room-repository';

/**
 * Real per-room **rent**, reconciled against ใบแจ้งค่าห้องพัก and the current
 * `KS_Mansion_DB`.
 *
 * These replace the figures seeded from the `ค่าห้องฯ` column of
 * แบบฟอร์มเก็บเงินค่าห้อง, which turned out to be a month's *total* bill, not
 * rent — room 101's 2,636 was 2,200 rent + 336 ไฟ + 100 น้ำ. Every value here
 * is now the rent alone.
 */
const RENT_RATE: Record<string, number> = {
  '101': 2200, '102': 3000, '103': 2500, '104': 3000, '105': 2500,
  '201': 2300, '202': 2500, '203': 2500, '204': 3000, '205': 2200,
  '206': 2500, '207': 3000, '208': 2500, '209': 2500, '210': 2500,
  '301': 2800, '302': 3000, '303': 2800, '304': 3000, '305': 3000,
  '306': 3000, '307': 2500, '308': 3000, '309': 2500, '310': 2300,
};

/** Rooms currently out of service; every other unit is occupied. */
const UNDER_MAINTENANCE = new Set(['104', '204', '209']);

/**
 * Rooms with a fan instead of an air conditioner, per the sheet's `type`
 * column — the one appliance fact the source data actually records today.
 *
 * TV and fridge are seeded `null` — genuinely "not on file" — because nothing
 * records them yet. That is the honest value, and it is why the model carries
 * three states rather than two.
 */
const FAN_ONLY = new Set(['102', '103', '306', '307', '308', '309', '310']);

function unit(label: string, floor: number): Room {
  const status: RoomStatus = UNDER_MAINTENANCE.has(label) ? 'maintenance' : 'occupied';
  return {
    id: label,
    label,
    floor,
    kind: 'unit',
    status,
    rentRate: RENT_RATE[label] ?? null,
    hasMeter: true,
    appliances: { tv: null, fridge: null, aircon: !FAN_ONLY.has(label) },
  };
}

/** Hand callers their own copy so mutations cannot reach the seed. */
function copyRoom(room: Room): Room {
  return { ...room, appliances: { ...room.appliances } };
}

/**
 * The registry from KS-7: 101–105, 201–210, 301–310, plus two common spaces.
 * The undercroft has no sub-meter; the laundry does and is actually rented
 * out (the split is lettable-vs-common, not rented-vs-not).
 *
 * The undercroft's label and floor deliberately differ from the live sheet
 * (`ห้องเช่าส่วนกลาง`, floor 1). That difference is the tell: if the console
 * shows `ห้องใต้ถุน`, it is running on this seed rather than reading Sheets.
 */
export const SEED_ROOMS: Room[] = [
  ...Array.from({ length: 5 }, (_, i) => unit(`10${i + 1}`, 1)),
  ...Array.from({ length: 10 }, (_, i) => unit(`2${String(i + 1).padStart(2, '0')}`, 2)),
  ...Array.from({ length: 10 }, (_, i) => unit(`3${String(i + 1).padStart(2, '0')}`, 3)),
  {
    id: 'laundry',
    label: 'ร้านซักผ้า',
    floor: 1,
    kind: 'common',
    status: 'occupied',
    rentRate: 1800,
    hasMeter: true,
    appliances: { tv: null, fridge: null, aircon: false },
  },
  {
    id: 'undercroft',
    label: 'ห้องใต้ถุน',
    floor: 0,
    kind: 'common',
    status: 'available',
    rentRate: null,
    hasMeter: false,
    appliances: { tv: null, fridge: null, aircon: false },
  },
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
