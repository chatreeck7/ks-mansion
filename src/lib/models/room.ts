/** Whether a room can be rented to a tenant. */
export type RoomKind = 'lettable' | 'common';

interface RoomBase {
  /** Stable identifier used in URLs. */
  id: string;
  /** What the admin calls it: '101', 'ร้านซักผ้า'. */
  label: string;
  /** 1-3 for the residential floors, 0 for ground-level common spaces. */
  floor: number;
  /** Whether an electricity sub-meter is read for this room each cycle. */
  hasMeter: boolean;
}

/** A unit that can be leased. Always has a rent rate. */
export interface LettableRoom extends RoomBase {
  kind: 'lettable';
  rentRate: number;
}

/** A shared space — laundry, undercroft. Never billed rent. */
export interface CommonRoom extends RoomBase {
  kind: 'common';
}

export type Room = LettableRoom | CommonRoom;

export function isLettable(room: Room): room is LettableRoom {
  return room.kind === 'lettable';
}

/** Rent rate, or null for common spaces. Never throws — callers render '—'. */
export function rentRateOf(room: Room): number | null {
  return isLettable(room) ? room.rentRate : null;
}
