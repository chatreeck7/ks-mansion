import { describe, expect, it } from 'vitest';
import { makeLease, makeMeterReading, makeRoom } from '@/lib/test-support/fixtures';
import type { Bill } from '@/lib/models/bill';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import { draftsFrom, planBillRun } from './bill-run';

/** Issued 26 มี.ค. 2568, due 10 เม.ย. */
const CYCLE = cycleIssuedIn(2025, 2);
const READ_DAY = new Date(2025, 2, 26);

/**
 * The reconciliation the card supplies as its acceptance data, from the real
 * ใบแจ้งค่าห้องพัก and แบบฟอร์มเก็บเงินค่าห้อง:
 *
 *   101: 2,200 rent + 336 ไฟ + 100 น้ำ = 2,636
 *   102: 3,000 rent + 1,463 ไฟ + 100 น้ำ = 4,563
 *
 * 336 is 56 units at ฿6; 1,463 is 209 units at ฿7. Two different rates in one
 * month is the point — the rate tracks government tariffs and is never a
 * constant in code.
 */
const ROOMS = [
  makeRoom({ id: '101', label: '101', floor: 1, rentRate: 2200 }),
  makeRoom({ id: '102', label: '102', floor: 1, rentRate: 3000 }),
];

const LEASES = [
  makeLease({ id: 'l-101', roomId: '101', startDate: new Date(2024, 0, 1),
              rentRate: 2200, occupantCount: 1 }),
  makeLease({ id: 'l-102', roomId: '102', startDate: new Date(2024, 0, 1),
              rentRate: 3000, occupantCount: 1 }),
];

const READINGS = [
  makeMeterReading({ id: 'm-101', roomId: '101', previousReading: 1256, currentReading: 1312,
                     ratePerUnit: 6, readDate: READ_DAY }),
  makeMeterReading({ id: 'm-102', roomId: '102', previousReading: 1000, currentReading: 1209,
                     ratePerUnit: 7, readDate: READ_DAY }),
];

function run(overrides: Partial<Parameters<typeof planBillRun>[0]> = {}) {
  return planBillRun({
    cycle: CYCLE,
    rooms: ROOMS,
    leases: LEASES,
    readings: READINGS,
    existing: [],
    ...overrides,
  });
}

const lineFor = (roomId: string) => run().lines.find((l) => l.roomId === roomId)!;

describe('the reconciliation from the real documents', () => {
  it('reproduces room 101: 2,200 + 336 + 100 = 2,636', () => {
    expect(lineFor('101')).toMatchObject({
      rentAmount: 2200,
      electricityAmount: 336,
      waterAmount: 100,
      total: 2636,
    });
  });

  it('reproduces room 102 at a different electricity rate: 3,000 + 1,463 + 100 = 4,563', () => {
    expect(lineFor('102')).toMatchObject({
      rentAmount: 3000,
      electricityAmount: 1463,
      waterAmount: 100,
      total: 4563,
    });
  });

  it('shows the working the paper bill shows, not just an amount', () => {
    // previous → current = units × rate, because that is what the ค่าไฟ row
    // of ใบแจ้งค่าห้องพัก prints.
    expect(lineFor('101').electricityBasis).toBe(
      '26 มี.ค. 2568 · 1,256 → 1,312 = 56 หน่วย × 6 บาท',
    );
    expect(lineFor('101').waterBasis).toBe('1 คน × 100');
  });
});

describe('which rooms get a line at all', () => {
  /** Owner-confirmed: a zero bill for an empty room is a row to read past. */
  it('leaves out a vacant room entirely', () => {
    const rooms = [...ROOMS, makeRoom({ id: '103', label: '103', floor: 1, status: 'available' })];
    expect(run({ rooms }).lines.some((l) => l.roomId === '103')).toBe(false);
  });

  it('leaves out a room under maintenance', () => {
    const rooms = [...ROOMS, makeRoom({ id: '104', label: '104', floor: 1, status: 'maintenance' })];
    expect(run({ rooms }).lines.some((l) => l.roomId === '104')).toBe(false);
  });

  /**
   * แจ้งออก: still using power this month, not paying rent for a month they
   * will not be here for. `chargesRent` is the rule, consumed not re-derived.
   */
  it('bills a room under แจ้งออก for utilities with no rent', () => {
    const rooms = ROOMS.map((r) => (r.id === '101' ? { ...r, status: 'noticeGiven' as const } : r));
    const line = run({ rooms }).lines.find((l) => l.roomId === '101')!;

    expect(line).toMatchObject({
      charge: 'utilitiesOnly',
      rentAmount: 0,
      electricityAmount: 336,
      waterAmount: 100,
      total: 436,
    });
    expect(line.problems).toEqual([]);
  });

  it('keeps the rooms in walking order', () => {
    expect(run().lines.map((l) => l.roomId)).toEqual(['101', '102']);
  });
});

describe('what stops a room being billed', () => {
  it('refuses a room whose meter has never been read', () => {
    const readings = READINGS.filter((r) => r.roomId !== '101');
    const line = run({ readings }).lines.find((l) => l.roomId === '101')!;

    expect(line.problems).toContain('ยังไม่ได้จดมิเตอร์ไฟ');
    expect(run({ readings }).issuable.map((l) => l.roomId)).toEqual(['102']);
  });

  it('refuses an occupied room with no lease behind it', () => {
    const leases = LEASES.filter((l) => l.roomId !== '101');
    const line = run({ leases }).lines.find((l) => l.roomId === '101')!;

    expect(line.problems).toContain('ห้องมีผู้เช่าแต่ไม่มีสัญญาเช่า');
  });

  /**
   * A wrong number sent to a tenant is worse than a bill that is late, so a
   * line with a problem is shown and never written.
   */
  it('shows a problem line but leaves it out of the run', () => {
    const readings = READINGS.filter((r) => r.roomId !== '101');
    const planned = run({ readings });

    expect(planned.lines).toHaveLength(2);
    expect(planned.issuable).toHaveLength(1);
    expect(planned.total).toBe(4563);
  });

  /**
   * The rule the date window used to enforce, restated the way the owner
   * actually works: **when** a meter was read decides nothing, but a figure
   * that has already been charged must not be charged again.
   */
  it('bills an out-of-month reading normally when no bill has consumed it', () => {
    // Walked on the 30th, a week after the nominal round. Under the old date
    // window this produced "ยังไม่ได้จดมิเตอร์ไฟรอบนี้" and could not be billed.
    const readings = [
      makeMeterReading({ id: 'm-late', roomId: '101', previousReading: 1256,
                         currentReading: 1312, ratePerUnit: 6, readDate: new Date(2025, 2, 30) }),
      ...READINGS.filter((r) => r.roomId !== '101'),
    ];
    const line = run({ readings }).lines.find((l) => l.roomId === '101')!;

    expect(line.problems).toEqual([]);
    expect(line.electricityAmount).toBe(336);
  });

  it('bills a reading taken on the 25th, the scheduled reading day', () => {
    // The case that sent a real round in circles: cycleFor puts the 25th in
    // the previous cycle, so the window this replaced refused it.
    const readings = [
      makeMeterReading({ id: 'm-25th', roomId: '101', previousReading: 1256,
                         currentReading: 1312, ratePerUnit: 6, readDate: new Date(2025, 2, 25) }),
      ...READINGS.filter((r) => r.roomId !== '101'),
    ];

    expect(run({ readings }).lines.find((l) => l.roomId === '101')!.problems).toEqual([]);
  });

  it('refuses a reading an earlier bill already charged, so a missed round is caught', () => {
    // February's round, and February's bill went out on the 26th. Nothing has
    // been read since, so there is nothing new to charge — the units would
    // otherwise be billed a second time.
    const readings = [
      makeMeterReading({ id: 'm-old', roomId: '101', previousReading: 1200,
                         currentReading: 1256, ratePerUnit: 6, readDate: new Date(2025, 1, 26) }),
      ...READINGS.filter((r) => r.roomId !== '101'),
    ];
    const februaryBill: Bill = {
      id: 'b-feb', roomId: '101', leaseId: 'l-101', cycle: '2025-02',
      issueDate: new Date(2025, 1, 26), dueDate: new Date(2025, 2, 10),
      rentAmount: 2200, electricityAmount: 336, waterAmount: 100,
      arrearsNote: null, archived: false,
    };
    const line = run({ readings, existing: [februaryBill] }).lines.find(
      (l) => l.roomId === '101',
    )!;

    expect(line.problems).toContain(
      'เลขมิเตอร์ล่าสุด (26 ก.พ. 2568) ออกบิลไปแล้ว — ยังไม่ได้จดรอบใหม่',
    );
    expect(line.electricityAmount).toBe(0);
    expect(run({ readings, existing: [februaryBill] }).issuable.map((l) => l.roomId)).toEqual([
      '102',
    ]);
  });

  it('does not call a reading stale just because an older bill exists', () => {
    const februaryBill: Bill = {
      id: 'b-feb', roomId: '101', leaseId: 'l-101', cycle: '2025-02',
      issueDate: new Date(2025, 1, 26), dueDate: new Date(2025, 2, 10),
      rentAmount: 2200, electricityAmount: 336, waterAmount: 100,
      arrearsNote: null, archived: false,
    };

    // March's round happened; February's bill predates it.
    expect(
      run({ existing: [februaryBill] }).lines.find((l) => l.roomId === '101')!.problems,
    ).toEqual([]);
  });

  it('takes the later of two readings in the same cycle, as a correction should', () => {
    const readings = [
      ...READINGS,
      makeMeterReading({ id: 'm-fix', roomId: '101', previousReading: 1256,
                         currentReading: 1400, ratePerUnit: 6, readDate: READ_DAY }),
    ];

    // 144 units, not 56 — the เก็บตก re-read supersedes.
    expect(run({ readings }).lines.find((l) => l.roomId === '101')!.electricityAmount).toBe(864);
  });
});

describe('not issuing the same cycle twice', () => {
  const issued: Bill = {
    id: 'b-001', roomId: '101', leaseId: 'l-101', cycle: CYCLE.id,
    issueDate: CYCLE.issueDate, dueDate: CYCLE.dueDate,
    rentAmount: 2200, electricityAmount: 336, waterAmount: 100,
    arrearsNote: null, archived: false,
  };

  it('flags a room already billed and leaves it out of the run', () => {
    const planned = run({ existing: [issued] });

    expect(planned.lines.find((l) => l.roomId === '101')!.alreadyIssued).toMatchObject({
      id: 'b-001',
    });
    expect(planned.issuable.map((l) => l.roomId)).toEqual(['102']);
    expect(planned.total).toBe(4563);
  });

  it('ignores a bill from another cycle', () => {
    // Dated when a February bill would actually have gone out. The issue date
    // matters now, not only the cycle label: it is what says whether this
    // cycle's reading has already been charged.
    const planned = run({
      existing: [{ ...issued, cycle: '2025-02', issueDate: new Date(2025, 1, 26) }],
    });
    expect(planned.issuable.map((l) => l.roomId)).toEqual(['101', '102']);
  });
});

describe('draftsFrom', () => {
  it('writes one draft per issuable line, carrying the cycle dates', () => {
    const drafts = draftsFrom(run());

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toEqual({
      roomId: '101',
      leaseId: 'l-101',
      cycle: '2025-03',
      issueDate: CYCLE.issueDate,
      dueDate: CYCLE.dueDate,
      rentAmount: 2200,
      electricityAmount: 336,
      waterAmount: 100,
      arrearsNote: null,
    });
  });

  /** ค้าง is asserted on a bill after issue (KS-22), never inferred by a run. */
  it('never carries an arrears note into a new bill', () => {
    expect(draftsFrom(run()).every((d) => d.arrearsNote === null)).toBe(true);
  });

  it('produces nothing when every line has a problem', () => {
    expect(draftsFrom(run({ readings: [] }))).toEqual([]);
  });
});
