import { describe, expect, it } from 'vitest';
import { makeBill, makePayment, makeRoom } from '@/lib/test-support/fixtures';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import { billBatchFor } from './bill-batch';

const CYCLE = cycleIssuedIn(2025, 2);

const ROOMS = [
  makeRoom({ id: '201', label: '201', floor: 2 }),
  makeRoom({ id: '101', label: '101', floor: 1 }),
  makeRoom({ id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common' }),
  makeRoom({ id: '102', label: '102', floor: 1 }),
];

const bill = (id: string, roomId: string, over = {}) =>
  makeBill({ id, roomId, cycle: CYCLE.id, ...over });

describe('billBatchFor', () => {
  /**
   * The point of the batch: the stack is carried round the building and
   * delivered off the top, so it has to come off the printer in the order
   * the building is walked — not in whatever order the sheet returned.
   */
  it('puts the stack in walking order, whatever order the bills arrive in', () => {
    const batch = billBatchFor(
      CYCLE,
      [bill('b-3', '201'), bill('b-1', 'laundry'), bill('b-2', '101'), bill('b-4', '102')],
      ROOMS,
      [],
    );

    expect(batch.documents.map((d) => d.roomLabel)).toEqual([
      '101',
      '102',
      '201',
      'ร้านซักผ้า',
    ]);
  });

  it('gives every bill in the cycle a slip', () => {
    const batch = billBatchFor(CYCLE, [bill('b-1', '101'), bill('b-2', '102')], ROOMS, []);

    expect(batch.documents.map((d) => d.reference)).toEqual(['b-1', 'b-2']);
  });

  it('has nothing to print for a cycle that was never issued', () => {
    const batch = billBatchFor(CYCLE, [], ROOMS, []);

    expect(batch.documents).toEqual([]);
    expect(batch.total).toBe(0);
  });

  /**
   * Read against the same figure on the bills page. If the two disagree a
   * bill is missing from the run, and the admin should find that out before
   * handing any of them over.
   */
  it('totals what the stack is worth', () => {
    const batch = billBatchFor(
      CYCLE,
      [bill('b-1', '101'), bill('b-2', '102', { rentAmount: 3000 })],
      ROOMS,
      [],
    );

    // 2200 + 336 + 100, and the same again with rent at 3000.
    expect(batch.total).toBe(2636 + 3436);
  });

  /**
   * The tenancy ended mid-cycle and the room left the registry. The bill is
   * real and the money is owed, so the slip prints — it just has no place in
   * the walk, so it goes last rather than disappearing.
   */
  it('still prints a bill whose room has been archived, at the end', () => {
    const batch = billBatchFor(
      CYCLE,
      [bill('b-gone', 'ghost'), bill('b-1', '101')],
      ROOMS,
      [],
    );

    expect(batch.documents.map((d) => d.reference)).toEqual(['b-1', 'b-gone']);
    // No room to take a label from, so the document falls back to the id.
    expect(batch.documents.at(-1)!.roomLabel).toBe('ghost');
  });

  /**
   * A reprint mid-cycle must not ask again for money already received, and
   * that rule lives in `settle` — the batch passes every payment to every
   * document rather than pre-filtering, so there is only one copy of it.
   */
  it('carries what has been paid onto each slip, and only that slip', () => {
    const batch = billBatchFor(
      CYCLE,
      [bill('b-1', '101'), bill('b-2', '102')],
      ROOMS,
      [
        makePayment({ id: 'p-1', billId: 'b-1', amount: 1000, paidOn: new Date(2025, 2, 28) }),
        makePayment({ id: 'p-void', billId: 'b-2', amount: 500, archived: true }),
      ],
    );

    const [first, second] = batch.documents;
    expect(first!.settlement.paid).toBe(1000);
    expect(first!.partlyPaid).toBe(true);
    // Voided, so it never happened — same as everywhere else in the console.
    expect(second!.settlement.paid).toBe(0);
    expect(second!.partlyPaid).toBe(false);
  });
});
