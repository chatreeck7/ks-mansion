import type { RoomAppliances, RoomStatus } from '@/lib/models/room';
import type { RoomEdit } from '@/lib/repositories/room-repository';

/**
 * Form fields to a `RoomEdit`.
 *
 * Shapes, does not validate — the store already parses every row with the read
 * path's own parser before writing and refuses anything unreadable, so a rule
 * restated here would be a second copy that drifts. What this does is turn the
 * two kinds of "nothing selected" into the two different nulls the model means.
 */

/** The four states, in the order the select offers them. */
export const ROOM_STATUSES: readonly RoomStatus[] = [
  'occupied',
  'noticeGiven',
  'available',
  'maintenance',
];

/**
 * Appliances are three-state and the blank is meaningful: `null` is "not on
 * file", which is a different claim from `false` ("this room has no fridge").
 * Only one of them belongs on a report.
 */
export function applianceFromForm(raw: string): boolean | null {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

/** The inverse, for pre-selecting the control. */
export function applianceToForm(value: boolean | null): string {
  return value === null ? '' : String(value);
}

export function roomEditFromForm(form: FormData): RoomEdit {
  const text = (field: string): string => String(form.get(field) ?? '').trim();

  const appliances: RoomAppliances = {
    tv: applianceFromForm(text('appliances.tv')),
    fridge: applianceFromForm(text('appliances.fridge')),
    aircon: applianceFromForm(text('appliances.aircon')),
  };

  const rent = text('rentRate');

  return {
    label: text('label'),
    status: text('status') as RoomStatus,
    // Blank is "no rate on record" and must stay blank. Coercing it to 0 here
    // would assert the space is free, which is a different and wrong claim.
    rentRate: rent === '' ? null : Number(rent),
    hasMeter: text('hasMeter') === 'true',
    appliances,
  };
}
