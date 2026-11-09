import { arrearsFieldName } from '@/lib/console/arrears';
import type { BillLine } from '@/lib/console/bill-run';
import type { IssuedLine } from '@/lib/console/history';
import { consolePath } from '@/lib/console/paths';
import { billTotal } from '@/lib/models/bill';
import type { PillTone } from '@/lib/models/pill-tone';

/**
 * The bill run as compact ledger rows (owner, 9 พ.ย. 2569): one row a room —
 * the four figures, a short status, and the bill's หมายเหตุ / ยอดค้าง right
 * in the row once the bill exists, instead of a second table underneath.
 *
 * The long reason a room is held back already heads the page as a problem
 * card with its fix; the row only needs the word for it.
 */

export interface BillLedgerRow {
  id: string;
  room: string;
  /** Small line under the room: how the rent and the electricity were worked. */
  basis: string;
  rent: number | null;
  electricity: number | null;
  water: number | null;
  /** Null while the room cannot be billed. */
  total: number | null;
  status: { tone: PillTone; label: string };
  /** The issued bill: its slip and its note field. */
  bill: { id: string; href: string; noteField: string; note: string } | null;
}

/** The word for a held-back room — the card above says the rest. */
export function shortProblem(problem: string): string {
  if (problem.includes('มิเตอร์ไฟ') || problem.includes('จดรอบใหม่')) return 'รอจดมิเตอร์';
  if (problem.includes('ค่าน้ำ')) return 'รอข้อมูลค่าน้ำ';
  if (problem.includes('สัญญา')) return 'ไม่มีสัญญาเช่า';
  return problem.length > 18 ? `${problem.slice(0, 16)}…` : problem;
}

const working = (previous: number | null, current: number | null) =>
  previous !== null && current !== null
    ? `ไฟ ${previous.toLocaleString('en-US')} → ${current.toLocaleString('en-US')} = ${(current - previous).toLocaleString('en-US')} หน่วย`
    : '';

export function rowsFromRun(lines: BillLine[], typedNotes?: { get(name: string): FormDataEntryValue | null }): BillLedgerRow[] {
  return lines.map((line) => {
    const bill = line.alreadyIssued;
    if (bill) {
      const field = arrearsFieldName(bill);
      const typed = typedNotes?.get(field);
      return {
        id: line.roomId,
        room: line.roomLabel,
        basis: working(bill.electricityPrevious, bill.electricityCurrent) || line.electricityBasis,
        rent: bill.rentAmount,
        electricity: bill.electricityAmount,
        water: bill.waterAmount,
        total: billTotal(bill),
        status: { tone: 'mute', label: 'ออกแล้ว' },
        bill: {
          id: bill.id,
          href: consolePath(`console/bills/${bill.id}`),
          noteField: field,
          note: typeof typed === 'string' ? typed : (bill.arrearsNote ?? ''),
        },
      };
    }
    const blocked = line.problems.length > 0;
    return {
      id: line.roomId,
      room: line.roomLabel,
      basis: [line.rentBasis, blocked ? null : working(line.electricityPrevious, line.electricityCurrent)]
        .filter(Boolean)
        .join(' · '),
      rent: line.rentAmount,
      electricity: blocked ? null : line.electricityAmount,
      water: blocked ? null : line.waterAmount,
      total: blocked ? null : line.total,
      status: blocked
        ? { tone: 'crit', label: shortProblem(line.problems[0]!) }
        : line.nothingDue
          ? { tone: 'info', label: 'ไม่มียอดรอบนี้' }
          : { tone: 'ok', label: 'พร้อมออก' },
      bill: null,
    };
  });
}

/** A past cycle: every row is an issued bill, read off the bill itself. */
export function rowsFromIssued(lines: IssuedLine[], typedNotes?: { get(name: string): FormDataEntryValue | null }): BillLedgerRow[] {
  return lines.map((line) => {
    const field = arrearsFieldName(line.bill);
    const typed = typedNotes?.get(field);
    return {
      id: line.bill.id,
      room: line.roomLabel,
      basis: line.electricityBasis === '—' ? '' : `ไฟ ${line.electricityBasis}`,
      rent: line.bill.rentAmount,
      electricity: line.bill.electricityAmount,
      water: line.bill.waterAmount,
      total: line.total,
      status: { tone: 'mute', label: 'ออกแล้ว' },
      bill: {
        id: line.bill.id,
        href: consolePath(`console/bills/${line.bill.id}`),
        noteField: field,
        note: typeof typed === 'string' ? typed : (line.bill.arrearsNote ?? ''),
      },
    };
  });
}
