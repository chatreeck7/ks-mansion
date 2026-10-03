import { describe, expect, it } from 'vitest';
import { makeBill, makeLease, makeMeterReading, makePayment, makeRoom } from '@/lib/test-support/fixtures';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import { monthProgress } from './month-progress';

/** Issued 26 มี.ค. 2568; looked at on 3 เม.ย. */
const CYCLE = cycleIssuedIn(2025, 2);
const TODAY = new Date(2025, 3, 3);

const ROOMS = [
  makeRoom({ id: '101', label: '101' }),
  makeRoom({ id: '102', label: '102' }),
  // Tenanted with no lease: the bill run refuses it.
  makeRoom({ id: '103', label: '103' }),
  makeRoom({ id: '104', label: '104', status: 'maintenance', hasMeter: false }),
];
const LEASES = [
  makeLease({ id: 'l-101', roomId: '101' }),
  makeLease({ id: 'l-102', roomId: '102' }),
];
const READINGS = ['101', '102', '103'].map((roomId) =>
  makeMeterReading({ id: `m-${roomId}`, roomId, readDate: new Date(2025, 2, 25) }),
);

function progress(overrides: Partial<Parameters<typeof monthProgress>[0]> = {}) {
  return monthProgress({
    cycle: CYCLE,
    today: TODAY,
    rooms: ROOMS,
    leases: LEASES,
    readings: READINGS,
    bills: [],
    payments: [],
    ...overrides,
  });
}

describe('monthProgress', () => {
  it('lists the six steps in the order the month is worked', () => {
    expect(progress().steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('ticks the meter step once every meter has a reading in this cycle', () => {
    const p = progress();
    expect(p.meters).toEqual({ read: 3, total: 3 });
    expect(p.steps[0]!.mark).toBe('done');
  });

  it('does not wait on meters in rooms under repair', () => {
    const p = progress({ readings: READINGS.slice(0, 3) });
    // 104 is under repair with no meter; make one that has a meter and no reading.
    const rooms = [...ROOMS, makeRoom({ id: '105', label: '105', status: 'maintenance' })];
    expect(progress({ rooms }).steps[0]!.mark).toBe('done');
    expect(p.steps[0]!.mark).toBe('done');
  });

  it('makes the first unfinished step current — water, before any bill is out', () => {
    const p = progress();
    expect(p.next?.id).toBe('water');
    expect(p.steps.filter((s) => s.current)).toHaveLength(1);
  });

  it('groups blocked rooms into one problem with one fix', () => {
    const p = progress();
    expect(p.problems).toHaveLength(1);
    expect(p.problems[0]!.rooms.map((r) => r.label)).toEqual(['103']);
    expect(p.problems[0]!.action.href).toContain('leases/new?room=103');
  });

  it('marks bills as part-done while some are out and some are blocked', () => {
    const bills = [
      makeBill({ id: 'b-101', roomId: '101', leaseId: 'l-101' }),
      makeBill({ id: 'b-102', roomId: '102', leaseId: 'l-102' }),
    ];
    const p = progress({ bills });
    const step = p.steps.find((s) => s.id === 'bills')!;
    expect(step.mark).toBe('partial');
    expect(step.warn).toBe(true);
    expect(p.next?.id).toBe('bills');
  });

  it('counts money from settlements and badges the spine with paid/total', () => {
    const bills = [
      makeBill({ id: 'b-101', roomId: '101', leaseId: 'l-101' }),
      makeBill({ id: 'b-102', roomId: '102', leaseId: 'l-102' }),
    ];
    const payments = [makePayment({ billId: 'b-101', amount: 2636 })];
    const p = progress({ bills, payments });
    expect(p.money).toMatchObject({ billCount: 2, paidCount: 1, unpaidCount: 1, outstanding: 2636 });
    expect(p.nav.payments).toEqual({ badge: '1/2' });
  });
});
