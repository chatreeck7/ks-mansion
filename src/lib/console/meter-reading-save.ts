import { isReadingDay, type BillingCycle } from '@/lib/models/billing-cycle';
import type { MeterReading, MeterReadingDraft } from '@/lib/models/meter-reading';
import type { BillRepository } from '@/lib/repositories/bill-repository';
import type { MeterReadingRepository } from '@/lib/repositories/meter-reading-repository';
import { meterStanding } from './meter-round';

/**
 * Saves a meter figure for a cycle's round — **the new figure replaces any
 * figure already saved for that meter in the same round** (owner, 7 พ.ย.
 * 2569: a wrong entry is corrected, not stacked on).
 *
 * - ครั้งก่อน is recomputed here from the sheet, not trusted from the page:
 *   last round's close (or the tenancy's start meter), the same figure the
 *   round showed. Only a meter never read before takes the typed previous.
 * - The figure being replaced is **archived, not deleted** (sheet-schema rules
 *   6 and 7): it stays on the sheet as history and stops counting.
 * - The new row is written first and the old one archived after, so a failure
 *   between the two leaves two live figures (the newer one wins everywhere)
 *   rather than none.
 * - Once the room's bill for the cycle is issued, its figure is part of a
 *   bill a tenant holds, so it can no longer be changed here.
 */
export interface SaveRoundReadingDeps {
  readings: MeterReadingRepository;
  bills: BillRepository;
}

export class ReadingLockedError extends Error {
  constructor(roomLabel: string) {
    super(`ออกบิลห้อง ${roomLabel} รอบนี้แล้ว — แก้เลขมิเตอร์ไม่ได้`);
    this.name = 'ReadingLockedError';
  }
}

export async function saveRoundReading(
  deps: SaveRoundReadingDeps,
  draft: MeterReadingDraft,
  cycle: BillingCycle,
  options: { roomLabel?: string; startMeter?: number | null } = {},
): Promise<{ saved: MeterReading; replaced: MeterReading[] }> {
  const bill = await deps.bills.findBill(draft.roomId, cycle.id);
  if (bill && !bill.archived) throw new ReadingLockedError(options.roomLabel ?? draft.roomId);

  const history = await deps.readings.listReadingsForRoom(draft.roomId);
  const standing = meterStanding(
    history,
    { roomId: draft.roomId, meterType: draft.meterType },
    cycle,
    options.startMeter ?? null,
  );
  const previousReading = standing.previousReading ?? draft.previousReading;
  if (draft.currentReading < previousReading) {
    throw new Error(
      `${options.roomLabel ?? draft.roomId}: ${draft.currentReading} น้อยกว่าเลขครั้งก่อน ${previousReading} — มิเตอร์ไม่เดินถอยหลัง`,
    );
  }

  const sameRound = history.filter(
    (r) => !r.archived && r.meterType === draft.meterType && isReadingDay(cycle, r.readDate),
  );
  const saved = await deps.readings.recordReading({ ...draft, previousReading });
  for (const old of sameRound) await deps.readings.archiveReading(old.id);
  return { saved, replaced: sameRound };
}
