import type { BillLine } from './bill-run';
import { consolePath } from './paths';

/**
 * Blocked bill lines, grouped by what is blocking them — one card each.
 *
 * The logbook rule: problems are grouped into one card with one fix, never
 * one row each. Eight rooms with no lease is one job ("ใส่สัญญาทีละห้อง")
 * with eight rooms in it. Each room chip still links to its own fix, so the
 * job can be done one room at a time from the card.
 */

export interface ProblemGroup {
  reason: string;
  /** The sentence on the card. */
  title: string;
  rooms: { id: string; label: string; href: string }[];
  action: { label: string; href: string };
}

/** The bill run's own wording, matched to the fix that clears it. */
const NO_LEASE = 'ห้องมีผู้เช่าแต่ไม่มีสัญญาเช่า';
const NO_READING = 'ยังไม่ได้จดมิเตอร์ไฟ';

function describe(reason: string, count: number) {
  if (reason === NO_LEASE) {
    return {
      title: `${count} ห้องนี้มีผู้เช่า แต่ยังไม่มีสัญญาในสมุด จึงยังไม่รู้ค่าเช่าและจำนวนคน`,
      fixFor: (roomId: string) => consolePath(`console/leases/new?room=${encodeURIComponent(roomId)}`),
      actionLabel: 'ใส่สัญญาทีละห้อง →',
    };
  }
  if (reason === NO_READING) {
    return {
      title: `${count} ห้องยังไม่ได้จดมิเตอร์ไฟ จึงยังคิดค่าไฟไม่ได้`,
      fixFor: () => consolePath('console/meter-round/grid'),
      actionLabel: 'ไปจดมิเตอร์ →',
    };
  }
  return {
    title: `${count} ห้อง: ${reason}`,
    fixFor: (roomId: string) => consolePath(`console/rooms/${encodeURIComponent(roomId)}`),
    actionLabel: 'เปิดห้องแรก →',
  };
}

export function problemGroups(lines: BillLine[]): ProblemGroup[] {
  const byReason = new Map<string, BillLine[]>();
  for (const line of lines) {
    if (line.alreadyIssued || line.problems.length === 0) continue;
    // Grouped by the first problem only: the first is what has to be fixed
    // first, and a room must not appear in two cards at once.
    const reason = line.problems[0]!;
    const group = byReason.get(reason);
    if (group) group.push(line);
    else byReason.set(reason, [line]);
  }

  return [...byReason.entries()]
    .map(([reason, group]) => {
      const { title, fixFor, actionLabel } = describe(reason, group.length);
      const rooms = group.map((line) => ({
        id: line.roomId,
        label: line.roomLabel,
        href: fixFor(line.roomId),
      }));
      return { reason, title, rooms, action: { label: actionLabel, href: rooms[0]!.href } };
    })
    .sort((a, b) => b.rooms.length - a.rooms.length);
}
