import type { Archivable } from './archivable';

/**
 * Which meter a reading came off.
 *
 * This type exists because **ร้านซักผ้า has two meters**. The source file
 * encodes the pair inline — `4215//786` → `4343//816` at `5//15` บาท/หน่วย —
 * and two typed rows per cycle say the same thing without a `//` convention
 * every reader of the sheet has to learn.
 *
 * Rooms carry an electricity meter only: ค่าน้ำ for a unit is occupants × 100,
 * not metered, which is why `occupant_count` is a required billing input on
 * the lease rather than a note.
 */
export type MeterType = 'electricity' | 'water';

export const METER_TYPES: readonly MeterType[] = ['electricity', 'water'];

/**
 * One meter read, as history rather than as current state.
 *
 * **Append-only** (docs/sheet-schema.md rule 6): a correction is a new row,
 * never an edit to an old one. A bill issued two years ago has to stay
 * reconstructable from what was true when it was issued, and the sheet is
 * hand-edited — an in-place correction would silently restate a bill that has
 * already been paid.
 */
export interface MeterReading extends Archivable {
  /** Stable identifier, `m-001` style. */
  id: string;
  /** The space this meter serves — a room id, never a room number label. */
  roomId: string;
  meterType: MeterType;
  /**
   * When the meter was read. Stored as Buddhist-era text in the sheet, same
   * as the lease dates and for the same reason (see the Sheets adapter).
   */
  readDate: Date;
  /** The figure on the dial at the end of the previous cycle. */
  previousReading: number;
  /** The figure on the dial now. */
  currentReading: number;
  /**
   * บาท per unit **for this reading**, not a globally configured rate.
   *
   * The 2553 archive shows ฿6/unit for rooms against ฿5 and ฿15 for the
   * laundry's two meters, and rates move over time. Storing the rate the
   * charge was actually calculated at is what keeps an old bill honest; a
   * global setting would silently re-price history the day it changed.
   */
  ratePerUnit: number;
  /** Free text from whoever walked the round — a skip reason, a re-read. */
  note: string | null;
}

/** A reading before it has an id — what the console records. */
export type MeterReadingDraft = Omit<MeterReading, 'id' | 'archived'>;

/**
 * Units consumed. **Derived, never stored.**
 *
 * A stored copy is a second place for the arithmetic to disagree with itself,
 * and this sheet is hand-edited — the copy is the one that would go stale.
 */
export function unitsUsed(reading: MeterReading): number {
  return reading.currentReading - reading.previousReading;
}

/** What this reading costs: units × the rate it was read at. */
export function readingCharge(reading: MeterReading): number {
  return unitsUsed(reading) * reading.ratePerUnit;
}

const METER_TYPE_LABELS: Record<MeterType, string> = {
  electricity: 'ไฟฟ้า',
  water: 'น้ำ',
};

export function meterTypeLabel(type: MeterType): string {
  return METER_TYPE_LABELS[type];
}

/**
 * Whether two readings are for the same meter — the same space *and* the same
 * utility.
 *
 * Worth a named function rather than an inline `&&`: the laundry is the one
 * space where room id alone does not identify a meter, so every "the previous
 * reading for this meter" lookup that compares on `roomId` only is correct
 * for 26 spaces and wrong for the 27th.
 */
export function isSameMeter(
  a: Pick<MeterReading, 'roomId' | 'meterType'>,
  b: Pick<MeterReading, 'roomId' | 'meterType'>,
): boolean {
  return a.roomId === b.roomId && a.meterType === b.meterType;
}
