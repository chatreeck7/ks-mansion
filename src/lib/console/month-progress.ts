import { formatBaht } from '@/lib/format/thai';
import type { Bill } from '@/lib/models/bill';
import { isReadingDay, type BillingCycle } from '@/lib/models/billing-cycle';
import type { Lease } from '@/lib/models/lease';
import type { MeterReading } from '@/lib/models/meter-reading';
import { settle, type Payment } from '@/lib/models/payment';
import type { Room } from '@/lib/models/room';
import { MONTH_STEPS } from '@/lib/console-sections';
import { planBillRun, type BillRun } from './bill-run';
import type { MarkKind } from './marks';
import { metersFrom } from './meter-round';
import { problemGroups, type ProblemGroup } from './problems';
import { waterRows, waterTotal } from './water-ledger';

/**
 * Where the month stands, step by step — the หน้าสมุด page and the spine's
 * marks are both drawn from this.
 *
 * Pure: it is handed what the repositories returned and works out the rest,
 * so it is tested without a sheet and cannot disagree with the step pages,
 * which use the same functions (`planBillRun`, `settle`, `waterRows`) to draw
 * themselves.
 */

export interface MonthStep {
  id: string;
  n: number;
  label: string;
  href: string;
  /** Desk wording. */
  sub: string;
  /** Phone wording — the same fact, shorter. */
  subShort: string;
  /** Null when the step has no done/not-done state (print-any-time steps). */
  mark: MarkKind | null;
  /** The word at the right of the line: ดู, ทำต่อ, เปิด. */
  action: string;
  /** The step to do next. Exactly one step is current, or none when all done. */
  current: boolean;
  /** Something is blocked in this step. */
  warn: boolean;
}

/** What the spine shows beside each section. */
export type NavProgress = Record<string, { mark?: MarkKind; badge?: string; warn?: boolean }>;

export interface MonthInput {
  cycle: BillingCycle;
  today: Date;
  rooms: Room[];
  leases: Lease[];
  readings: MeterReading[];
  /** Every bill on file; filtered to the cycle here. */
  bills: Bill[];
  payments: Payment[];
}

export interface MonthProgress {
  steps: MonthStep[];
  /** The current step, for the "ทำต่อ" card. Null once the month is done. */
  next: MonthStep | null;
  run: BillRun;
  problems: ProblemGroup[];
  money: {
    billCount: number;
    paidCount: number;
    unpaidCount: number;
    billed: number;
    collected: number;
    outstanding: number;
  };
  meters: { read: number; total: number };
  waterTotal: number;
  nav: NavProgress;
}

export function monthProgress({ cycle, today, rooms, leases, readings, bills, payments }: MonthInput): MonthProgress {
  const live = readings.filter((r) => !r.archived);

  // ── 1 · meters ─────────────────────────────────────────────────────────
  const meters = metersFrom(rooms, live);
  const isRead = (meter: (typeof meters)[number]) =>
    live.some(
      (r) => r.roomId === meter.roomId && r.meterType === meter.meterType && isReadingDay(cycle, r.readDate),
    );
  const readThisCycle = meters.filter(isRead).length;
  // A meter in a vacant room or one under repair can be read, but nothing is
  // billed from it — so leaving it unread does not hold the month up.
  const idle = new Set(
    rooms.filter((r) => r.status === 'available' || r.status === 'maintenance').map((r) => r.id),
  );
  const neededUnread = meters.filter((m) => !idle.has(m.roomId) && !isRead(m)).length;

  // ── 3 · bills (before water: water's state follows from it) ───────────
  const run = planBillRun({ cycle, rooms, leases, readings: live, existing: bills });
  const issued = run.lines.filter((l) => l.alreadyIssued).length;
  const blocked = run.lines.filter((l) => !l.alreadyIssued && l.problems.length > 0).length;
  const ready = run.issuable.length;

  // ── 2 · water ──────────────────────────────────────────────────────────
  const water = waterTotal(waterRows(rooms, leases, live, today));

  // ── 4 · money ──────────────────────────────────────────────────────────
  const cycleBills = bills.filter((b) => b.cycle === cycle.id && !b.archived);
  const settlements = cycleBills.map((b) => settle(b, payments));
  const paidCount = settlements.filter((s) => s.state === 'paid' || s.state === 'overpaid').length;
  const billed = settlements.reduce((sum, s) => sum + s.due, 0);
  const collected = settlements.reduce((sum, s) => sum + s.paid, 0);
  const outstanding = settlements.reduce((sum, s) => sum + Math.max(s.outstanding, 0), 0);
  const unpaidCount = cycleBills.length - paidCount;

  const meterMark: MarkKind =
    meters.length === 0 ? 'none' : neededUnread === 0 ? 'done' : readThisCycle > 0 ? 'partial' : 'todo';
  const billMark: MarkKind =
    run.lines.length === 0
      ? 'none'
      : ready === 0 && blocked === 0
        ? 'done'
        : issued > 0
          ? 'partial'
          : 'todo';
  // Water has no "confirmed" flag of its own: the counts are checked, then
  // written into the bills. Once bills are out, this month's water is fixed.
  const waterMark: MarkKind = issued > 0 ? 'done' : 'todo';
  const payMark: MarkKind | null =
    cycleBills.length === 0 ? null : paidCount >= cycleBills.length ? 'done' : null;

  const step = (id: string) => MONTH_STEPS.find((s) => s.id === id)!;
  const base = (id: string) => ({ id, n: step(id).step!, label: step(id).label, href: step(id).href });

  const steps: MonthStep[] = [
    {
      ...base('meter-round'),
      sub:
        readThisCycle >= meters.length
          ? `ครบ ${meters.length} จุด`
          : meterMark === 'done'
            ? `จดแล้ว ${readThisCycle} จาก ${meters.length} จุด · ที่เหลือเป็นห้องว่าง/ปรับปรุง`
            : `จดแล้ว ${readThisCycle} จาก ${meters.length} จุด`,
      subShort:
        meterMark === 'done' ? `ครบที่ต้องจด (${readThisCycle}/${meters.length})` : `${readThisCycle}/${meters.length} จุด`,
      mark: meterMark,
      action: meterMark === 'done' ? 'ดู' : 'ทำต่อ',
      current: false,
      warn: false,
    },
    {
      ...base('water'),
      label: 'ค่าน้ำ',
      sub: waterMark === 'done' ? `ยืนยันแล้ว · รวม ${formatBaht(water)} บาท` : `ตรวจจำนวนผู้พัก · รวม ${formatBaht(water)} บาท`,
      subShort: waterMark === 'done' ? 'ยืนยันแล้ว' : `รวม ${formatBaht(water)} บาท`,
      mark: waterMark,
      action: waterMark === 'done' ? 'ดู' : 'ทำต่อ',
      current: false,
      warn: false,
    },
    {
      ...base('bills'),
      sub: [
        `ออกแล้ว ${issued} ใบ`,
        ready > 0 ? `พร้อมออก ${ready}` : '',
        blocked > 0 ? `ค้าง ${blocked} ห้อง` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      subShort: [`${issued} ใบ`, blocked > 0 ? `ค้าง ${blocked} ห้อง` : ''].filter(Boolean).join(' · '),
      mark: billMark,
      action: billMark === 'done' ? 'ดู' : 'ทำต่อ',
      current: false,
      warn: blocked > 0,
    },
    {
      ...base('payments'),
      label: 'บันทึกเงินเข้า',
      sub:
        cycleBills.length === 0
          ? 'รอออกบิลก่อน'
          : `รับแล้ว ${paidCount} จาก ${cycleBills.length}`,
      subShort: cycleBills.length === 0 ? 'รอออกบิล' : `รับแล้ว ${paidCount} จาก ${cycleBills.length}`,
      mark: payMark,
      action: payMark === 'done' ? 'ดู' : 'ทำต่อ',
      current: false,
      warn: false,
    },
    {
      ...base('collection'),
      sub: 'พิมพ์ได้ทุกเมื่อ',
      subShort: 'พิมพ์ได้ทุกเมื่อ',
      mark: null,
      action: 'เปิด',
      current: false,
      warn: false,
    },
    {
      ...base('documents'),
      label: 'เอกสารประจำรอบ',
      sub: 'ทำตอนจบรอบ',
      subShort: 'ทำตอนจบรอบ',
      mark: null,
      action: 'เปิด',
      current: false,
      warn: false,
    },
  ];

  // The first of the four working steps that is not done. Steps 5 and 6 are
  // never "current" — they can be done any time and are never the blocker.
  const next = steps.slice(0, 4).find((s) => s.mark !== 'done' && s.mark !== 'none') ?? null;
  if (next) next.current = true;

  const nav: NavProgress = {};
  for (const s of steps) {
    if (s.id === 'payments' && cycleBills.length > 0 && s.mark !== 'done') {
      nav[s.id] = { badge: `${paidCount}/${cycleBills.length}` };
    } else if (s.mark && s.mark !== 'none' && s.mark !== 'todo') {
      nav[s.id] = { mark: s.mark, warn: s.warn };
    }
  }

  return {
    steps,
    next,
    run,
    problems: problemGroups(run.lines),
    money: { billCount: cycleBills.length, paidCount, unpaidCount, billed, collected, outstanding },
    meters: { read: readThisCycle, total: meters.length },
    waterTotal: water,
    nav,
  };
}
