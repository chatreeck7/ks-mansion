import type { Archivable } from './archivable';
import type { PillTone } from './pill-tone';

/** What kind of space this is — not whether it earns rent. */
export type SpaceKind = 'unit' | 'common';

/**
 * Occupancy state, matching the values the monthly report actually tracks.
 *
 * `noticeGiven` (แจ้งออก) is a real state between occupied and vacant, not a
 * nicety: a room that has given notice is billed for **utilities only, no
 * rent** — the `จะได้รับ ณ สิ้นเดือน` column in รายการค่าไฟและค่าห้อง has
 * three values (YES / NO / Utility) for exactly this reason. A boolean
 * occupied/vacant cannot express it.
 */
export type RoomStatus = 'occupied' | 'noticeGiven' | 'available' | 'maintenance';

/**
 * Appliances the landlord provides, tracked per room.
 *
 * These live on the room rather than as F6 assets because that is what the
 * month-end report prints — รายการค่าไฟและค่าห้อง has TV / ตู้เย็น / แอร์
 * columns with per-floor totals. F6 can reference them later without
 * needing to own them now.
 *
 * **`null` means "not on file", and is a different fact from `false`.**
 * Nothing in the source data records TV or fridge today, and forcing every
 * room to declare `false` before the tab can be read would have meant
 * inventing 54 cells of data for a report that does not exist yet — the
 * opposite of the "don't invent data" ruling. A third state costs the report
 * one branch and keeps the distinction that matters: a room with no fridge
 * and a room nobody has surveyed should not print the same.
 */
export interface RoomAppliances {
  tv: boolean | null;
  fridge: boolean | null;
  aircon: boolean | null;
}

export interface Room extends Archivable {
  /** Stable identifier used in URLs. */
  id: string;
  /** What the admin calls it: '101', 'ร้านซักผ้า'. */
  label: string;
  /** 1-3 for the residential floors, 0 for ground-level spaces. */
  floor: number;
  /** Whether an electricity sub-meter is read for this space each cycle. */
  hasMeter: boolean;
  /** A residential unit, or a common area such as the laundry or undercroft. */
  kind: SpaceKind;
  /**
   * Monthly **rent** — not a total bill.
   *
   * Worth stating explicitly: this was previously seeded from the `ค่าห้องฯ`
   * column of แบบฟอร์มเก็บเงินค่าห้อง, which is actually a month's *total*
   * (rent + water + electricity) and so varies month to month. Room 101's
   * rent is 2,200; its 2,636 total is 2,200 + 336 ไฟ + 100 น้ำ.
   *
   * Null means no rate is recorded — not that the space is free, and not
   * zero. Any space may carry a rate, including common areas.
   */
  rentRate: number | null;
  status: RoomStatus;
  appliances: RoomAppliances;
}

/** True for residential units. Common areas may still be rented — see rentRate. */
export function isUnit(room: Room): boolean {
  return room.kind === 'unit';
}

/** True while someone is living there, including after notice is given. */
export function isTenanted(room: Room): boolean {
  return room.status === 'occupied' || room.status === 'noticeGiven';
}

/**
 * Whether rent is charged this cycle. A room under notice still pays
 * utilities but no rent — the `Utility` case in the monthly report.
 */
export function chargesRent(room: Room): boolean {
  return room.status === 'occupied';
}

const STATUS_LABELS: Record<RoomStatus, string> = {
  occupied: 'มีผู้เช่า',
  noticeGiven: 'แจ้งออก',
  available: 'ว่าง',
  maintenance: 'ปรับปรุง',
};

export function statusLabel(status: RoomStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Colour by what the state asks of the reader, not by whether it is "good".
 * `noticeGiven` is the only one carrying a deadline — a room to re-let before
 * month end — so it is the only one that warns.
 */
const STATUS_TONES: Record<RoomStatus, PillTone> = {
  occupied: 'ok',
  noticeGiven: 'warn',
  available: 'info',
  maintenance: 'mute',
};

export function statusTone(status: RoomStatus): PillTone {
  return STATUS_TONES[status];
}
