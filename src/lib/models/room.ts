/** What kind of space this is — not whether it earns rent. */
export type SpaceKind = 'unit' | 'common';

export interface Room {
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
  /** Monthly rent, or null when no rate is recorded. Any space may carry one. */
  rentRate: number | null;
}

/** True for residential units. Common areas may still be rented — see rentRate. */
export function isUnit(room: Room): boolean {
  return room.kind === 'unit';
}
