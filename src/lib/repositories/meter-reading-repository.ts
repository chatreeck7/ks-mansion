import type { MeterReading, MeterReadingDraft, MeterType } from '@/lib/models/meter-reading';

/**
 * Meter readings are **appended, never edited** (docs/sheet-schema.md rule 6).
 *
 * The absence of an `updateReading` here is the whole point of this
 * interface, so it is worth stating rather than leaving as an omission
 * someone later reads as an oversight: a mis-keyed reading is corrected by
 * recording the right one, which is exactly what KS-71's เก็บตก sweep and
 * round close produce anyway. An in-place edit would restate a bill that has
 * already been issued and paid, with nothing in the sheet to show it moved.
 *
 * `archiveReading` is kept because rule 7 still applies to a row that should
 * never have existed at all — a reading entered against the wrong room. That
 * is a different act from correcting a figure, and the two must not collapse
 * into one: archiving a reading to fix a typo would take its history with it.
 */
export interface MeterReadingRepository {
  /** Every reading, oldest sheet row first. Excludes archived rows. */
  listReadings(): Promise<MeterReading[]>;
  /** Readings for one space — both meters, where a space has two. */
  listReadingsForRoom(roomId: string): Promise<MeterReading[]>;
  /** Returns an archived reading too, so an issued bill stays traceable. */
  getReading(id: string): Promise<MeterReading | null>;

  /**
   * The reading a new one continues from: the most recent for that exact
   * meter, or null the first time it is read.
   *
   * A domain verb rather than something each caller filters for itself,
   * because the tie-break is a rule and not a detail. Two readings on the
   * same date is what a correction *looks like* — the sweep re-reads a room
   * the same evening — so the later row wins, and "later" means later in the
   * sheet, which is the order they were appended in.
   */
  latestReading(roomId: string, meterType: MeterType): Promise<MeterReading | null>;

  recordReading(draft: MeterReadingDraft): Promise<MeterReading>;
  archiveReading(id: string): Promise<MeterReading>;
}
