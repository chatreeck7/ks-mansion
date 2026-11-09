import { draftsFrom, planBillRun, type BillLine } from '@/lib/console/bill-run';
import { billTotal, type Bill, type BillDraft } from '@/lib/models/bill';
import { cycleFor, cycleFromId, previousCycle } from '@/lib/models/billing-cycle';
import type { Lease } from '@/lib/models/lease';
import type { MeterReading } from '@/lib/models/meter-reading';
import type { Room } from '@/lib/models/room';

/**
 * ยกเลิกบิลแล้วออกใหม่ (owner, 9 พ.ย. 2569: room 210's meter figure was
 * corrected after its bill went out, so the slip — and the money checked
 * against it — were wrong).
 *
 * A bill is never edited. It is cancelled (archived), and the room's bill
 * for that cycle is worked again by the same bill run that issued it, from
 * the figures as they now stand. This module answers, for one bill: what
 * the new one would say, whether that differs, and whether a reissue is
 * allowed at all.
 *
 * Allowed only for the cycle being issued now and the one being collected
 * (the previous one) — early in a month the bills going round are last
 * month's, and that is exactly when a wrong figure is found. Older months
 * are closed: a run works from today's rooms and rates and would restate
 * what was charged.
 */

export interface ReissuePlan {
  /** The run's line for this room and cycle, worked as if the bill were cancelled. */
  line: BillLine | null;
  /** What would be written, when a reissue can go ahead. */
  draft: BillDraft | null;
  /** Why it cannot, in Thai — null when it can. */
  problem: string | null;
  /** The new bill would differ from the cancelled one in a figure. */
  changed: boolean;
}

/** The cycles a bill may still be cancelled and reissued in. */
export function inReissueWindow(cycleId: string, now: Date): boolean {
  return cycleId >= previousCycle(cycleFor(now)).id;
}

export function reissuePlan(input: {
  bill: Bill;
  rooms: Room[];
  leases: Lease[];
  readings: MeterReading[];
  /** Active bills on the sheet; the bill being replaced is left out here. */
  existing: Bill[];
  now: Date;
}): ReissuePlan {
  const { bill, now } = input;
  const none = (problem: string): ReissuePlan => ({ line: null, draft: null, problem, changed: false });

  const cycle = cycleFromId(bill.cycle);
  if (!cycle) return none(`ไม่รู้จักรอบ "${bill.cycle}"`);
  if (!inReissueWindow(bill.cycle, now)) {
    return none('ออกใหม่ได้เฉพาะรอบปัจจุบันกับรอบที่กำลังเก็บเงิน — รอบนี้ปิดไปแล้ว');
  }

  const others = input.existing.filter((other) => other.id !== bill.id && !other.archived);
  const standing = others.find((other) => other.roomId === bill.roomId && other.cycle === bill.cycle);
  if (standing) return none(`ห้องนี้มีบิลรอบนี้อยู่แล้ว (${standing.id})`);
  const later = others.find((other) => other.roomId === bill.roomId && other.cycle > bill.cycle);
  if (later) return none(`ห้องนี้ออกบิลรอบถัดไปแล้ว (${later.id}) — ออกบิลรอบก่อนซ้ำไม่ได้`);

  const run = planBillRun({ cycle, rooms: input.rooms, leases: input.leases, readings: input.readings, existing: others });
  const line = run.lines.find((candidate) => candidate.roomId === bill.roomId) ?? null;
  if (!line) return none('ห้องนี้ไม่มีอะไรต้องออกบิลรอบนี้แล้ว');
  if (line.problems.length > 0) return { line, draft: null, problem: line.problems[0]!, changed: false };
  if (line.nothingDue) return { line, draft: null, problem: 'ตามข้อมูลล่าสุด ห้องนี้ไม่มียอดรอบนี้', changed: false };

  const draft = draftsFrom(run).find((candidate) => candidate.roomId === bill.roomId) ?? null;
  if (!draft) return { line, draft: null, problem: 'ออกบิลห้องนี้ไม่ได้', changed: false };

  const changed =
    billTotal(draft) !== billTotal(bill) ||
    draft.rentAmount !== bill.rentAmount ||
    draft.electricityAmount !== bill.electricityAmount ||
    draft.waterAmount !== bill.waterAmount ||
    draft.electricityPrevious !== bill.electricityPrevious ||
    draft.electricityCurrent !== bill.electricityCurrent ||
    draft.waterQuantity !== bill.waterQuantity;
  return { line, draft, problem: null, changed };
}
