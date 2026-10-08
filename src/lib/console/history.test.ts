import { describe, expect, it } from 'vitest';
import { makeBill, makePayment, makeRoom } from '@/lib/test-support/fixtures';
import { cycleHistory, issuedLines, viewedCycle } from './history';

/** 7 ต.ค. 2569 — inside the cycle issued 26 ก.ย. 2569, id `2026-09`. */
const NOW = new Date(2026, 9, 7);

describe('cycleHistory', () => {
  it('lists the last twelve cycles newest first, billed or not', () => {
    const history = cycleHistory([], [], NOW);

    expect(history).toHaveLength(12);
    expect(history[0]!.cycle.id).toBe('2026-09');
    expect(history[0]!.current).toBe(true);
    expect(history.at(-1)!.cycle.id).toBe('2025-10');
    expect(history.slice(1).every((row) => !row.current)).toBe(true);
    expect(history.every((row) => row.billCount === 0 && row.billed === 0)).toBe(true);
  });

  /**
   * The whole point of the page: a year-old month is still reachable once it
   * has bills, rather than falling off the end of a fixed window.
   */
  it('reaches back past the window to any cycle that has bills', () => {
    const history = cycleHistory([makeBill({ cycle: '2024-01' })], [], NOW);

    expect(history).toHaveLength(13);
    expect(history.at(-1)!.cycle.id).toBe('2024-01');
    expect(history.at(-1)!.billCount).toBe(1);
  });

  it('adds up what each cycle billed, collected and is still owed', () => {
    const bills = [
      // 2,636 each.
      makeBill({ id: 'b-1', roomId: '101', cycle: '2026-08' }),
      makeBill({ id: 'b-2', roomId: '102', cycle: '2026-08' }),
      makeBill({ id: 'b-3', roomId: '103', cycle: '2026-08' }),
    ];
    const payments = [
      makePayment({ id: 'p-1', billId: 'b-1', amount: 2636 }),
      // Part payment.
      makePayment({ id: 'p-2', billId: 'b-2', amount: 1000 }),
    ];

    const august = cycleHistory(bills, payments, NOW).find((row) => row.cycle.id === '2026-08')!;

    expect(august).toMatchObject({
      billCount: 3,
      paidCount: 1,
      billed: 7908,
      collected: 3636,
      outstanding: 4272,
    });
  });

  /** Overpayment clears a debt (see `settle`); it is not a credit to net off. */
  it('counts an overpaid bill as paid and owing nothing', () => {
    const bills = [
      makeBill({ id: 'b-1', roomId: '101', cycle: '2026-08' }),
      makeBill({ id: 'b-2', roomId: '102', cycle: '2026-08' }),
    ];
    const payments = [makePayment({ id: 'p-1', billId: 'b-1', amount: 5000 })];

    const august = cycleHistory(bills, payments, NOW).find((row) => row.cycle.id === '2026-08')!;

    expect(august.paidCount).toBe(1);
    expect(august.outstanding).toBe(2636);
  });

  it('ignores archived bills and archived payments', () => {
    const bills = [
      makeBill({ id: 'b-1', cycle: '2026-08' }),
      makeBill({ id: 'b-old', cycle: '2026-08', archived: true }),
    ];
    const payments = [makePayment({ id: 'p-1', billId: 'b-1', archived: true })];

    const august = cycleHistory(bills, payments, NOW).find((row) => row.cycle.id === '2026-08')!;

    expect(august.billCount).toBe(1);
    expect(august.collected).toBe(0);
  });

  it('leaves out a bill filed under a cycle that has not happened yet', () => {
    const history = cycleHistory([makeBill({ cycle: '2027-01' })], [], NOW);

    expect(history.map((row) => row.cycle.id)).not.toContain('2027-01');
    expect(history[0]!.cycle.id).toBe('2026-09');
  });
});

describe('viewedCycle', () => {
  it('is the current cycle when nothing is asked for', () => {
    expect(viewedCycle(null, NOW)).toMatchObject({ cycle: { id: '2026-09' }, past: false, problem: null });
    expect(viewedCycle('', NOW).problem).toBeNull();
  });

  it('is the current cycle, not past, when that is what is asked for', () => {
    expect(viewedCycle('2026-09', NOW)).toMatchObject({ cycle: { id: '2026-09' }, past: false, problem: null });
  });

  it('opens an earlier cycle as past', () => {
    expect(viewedCycle('2025-02', NOW)).toMatchObject({ cycle: { id: '2025-02' }, past: true, problem: null });
  });

  it('falls back to the current cycle and says so for an address that is not a cycle', () => {
    const viewed = viewedCycle('2026-13', NOW);

    expect(viewed.cycle.id).toBe('2026-09');
    expect(viewed.past).toBe(false);
    expect(viewed.problem).toContain('2026-13');
  });

  /** Issuing into a month that has not started is the accident to prevent. */
  it('refuses a cycle after the current one', () => {
    const viewed = viewedCycle('2026-10', NOW);

    expect(viewed.cycle.id).toBe('2026-09');
    expect(viewed.past).toBe(false);
    expect(viewed.problem).toBe('รอบนั้นยังไม่ถึง — แสดงรอบปัจจุบันแทน');
  });
});

describe('issuedLines', () => {
  const ROOMS = [
    makeRoom({ id: '201', label: '201', floor: 2 }),
    makeRoom({ id: '101', label: '101', floor: 1 }),
  ];

  it('orders bills the way the building is walked', () => {
    const lines = issuedLines(
      [makeBill({ id: 'b-201', roomId: '201' }), makeBill({ id: 'b-101', roomId: '101' })],
      ROOMS,
    );

    expect(lines.map((line) => line.roomLabel)).toEqual(['101', '201']);
  });

  it('shows the working the bill kept, not what the meter says today', () => {
    const [line] = issuedLines([makeBill()], ROOMS);

    expect(line!.total).toBe(2636);
    expect(line!.electricityBasis).toBe('11,900 → 11,948 = 48 หน่วย');
  });

  it('prints a dash where the bill kept no dial figures', () => {
    const [line] = issuedLines(
      [makeBill({ electricityPrevious: null, electricityCurrent: null })],
      ROOMS,
    );

    expect(line!.electricityBasis).toBe('—');
  });

  it('keeps a bill whose room has left the register, under its id', () => {
    const lines = issuedLines([makeBill({ id: 'b-x', roomId: 'gone' }), makeBill()], ROOMS);

    expect(lines.map((line) => line.roomLabel)).toEqual(['101', 'gone']);
  });

  it('drops archived bills', () => {
    expect(issuedLines([makeBill({ archived: true })], ROOMS)).toEqual([]);
  });
});
