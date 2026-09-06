import { describe, expect, it } from 'vitest';
import { makeBill, makePayment, makeRoom } from '@/lib/test-support/fixtures';
import type { LedgerInputCell } from '@/lib/models/ledger';
import {
  amountFieldName,
  noteFieldName,
  parsePaidOn,
  paymentRows,
  paymentsFromForm,
  toPaymentGroups,
  PAYMENT_COLUMNS,
} from './payment-ledger';

const BILLS = [
  makeBill({ id: 'b-001', roomId: '101', rentAmount: 2200, electricityAmount: 336, waterAmount: 100 }),
  makeBill({ id: 'b-002', roomId: '102', rentAmount: 3000, electricityAmount: 1463, waterAmount: 100 }),
];

const ROOMS = [makeRoom({ id: '101', label: '101' }), makeRoom({ id: '102', label: '102' })];

const TODAY = new Date(2025, 3, 2);

function form(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

const rows = (payments = [] as ReturnType<typeof makePayment>[]) =>
  paymentRows(BILLS, payments, ROOMS);

describe('paymentRows', () => {
  it('settles each bill against its own payments', () => {
    const [first, second] = rows([makePayment({ billId: 'b-001', amount: 2000 })]);

    expect(first!.settlement).toMatchObject({ due: 2636, paid: 2000, outstanding: 636 });
    expect(second!.settlement).toMatchObject({ due: 4563, paid: 0, state: 'unpaid' });
  });

  it('labels the row from the room, falling back to the id', () => {
    const orphan = paymentRows([makeBill({ id: 'b-009', roomId: '999' })], [], ROOMS);
    expect(orphan[0]!.roomLabel).toBe('999');
  });
});

describe('toPaymentGroups', () => {
  it('supplies a cell for every declared column', () => {
    for (const row of toPaymentGroups(rows(), 'รอบ')[0]!.rows) {
      for (const column of PAYMENT_COLUMNS) {
        expect(row.cells[column.key], `${row.id} is missing "${column.key}"`).toBeDefined();
      }
    }
  });

  /**
   * The one that would be a real defect: a grid arriving with every field
   * already holding what is owed is one submit away from recording
   * twenty-seven payments nobody made.
   */
  it('leaves the amount field empty and shows the outstanding only as a hint', () => {
    const amount = toPaymentGroups(rows(), 'รอบ')[0]!.rows[0]!.cells.amount as LedgerInputCell;

    expect(amount.value).toBe('');
    expect(amount.placeholder).toBe('2,636');
  });

  it('offers no hint once a bill is settled', () => {
    const settled = rows([makePayment({ billId: 'b-001', amount: 2636 })]);
    const amount = toPaymentGroups(settled, 'รอบ')[0]!.rows[0]!.cells.amount as LedgerInputCell;

    expect(amount.placeholder).toBe('');
  });

  it('gives the note field a text keyboard, since a name is not a number', () => {
    const note = toPaymentGroups(rows(), 'รอบ')[0]!.rows[0]!.cells.note as LedgerInputCell;
    expect(note.mode).toBe('text');
  });

  it('names each field by its bill and each label by its room', () => {
    const row = toPaymentGroups(rows(), 'รอบ')[0]!.rows[1]!;

    expect((row.cells.amount as LedgerInputCell).name).toBe('paid:b-002');
    expect((row.cells.amount as LedgerInputCell).label).toContain('102');
  });

  it('puts back what was typed when a submission comes back', () => {
    const submitted = form({ 'paid:b-001': '2000', 'paidnote:b-001': 'โอนในชื่อ Frame' });
    const row = toPaymentGroups(rows(), 'รอบ', submitted)[0]!.rows[0]!;

    expect((row.cells.amount as LedgerInputCell).value).toBe('2000');
    expect((row.cells.note as LedgerInputCell).value).toBe('โอนในชื่อ Frame');
  });

  it('shows an overpayment plainly rather than as a fault', () => {
    const over = rows([makePayment({ billId: 'b-001', amount: 6963 })]);
    const state = toPaymentGroups(over, 'รอบ')[0]!.rows[0]!.cells.state;

    expect(state).toMatchObject({ kind: 'pill', tone: 'mute', label: 'จ่ายเกิน' });
  });
});

describe('paymentsFromForm', () => {
  it('records only the rooms that were filled in', () => {
    const { drafts, errors } = paymentsFromForm(rows(), form({ 'paid:b-002': '4563' }), TODAY, 'transfer');

    expect(errors).toEqual([]);
    expect(drafts).toEqual([
      { billId: 'b-002', paidOn: TODAY, amount: 4563, method: 'transfer', note: null },
    ]);
  });

  /** A blank row is the ordinary state of most rooms on most days. */
  it('writes nothing when nothing was typed', () => {
    expect(paymentsFromForm(rows(), form({}), TODAY, 'transfer').drafts).toEqual([]);
    expect(paymentsFromForm(rows(), form({ 'paid:b-001': '  ' }), TODAY, 'cash').drafts).toEqual([]);
  });

  it('reads a figure typed with the separators it is displayed with', () => {
    const { drafts } = paymentsFromForm(rows(), form({ 'paid:b-001': '2,636' }), TODAY, 'transfer');
    expect(drafts[0]!.amount).toBe(2636);
  });

  it('carries the note that says who the transfer came from', () => {
    const { drafts } = paymentsFromForm(
      rows(),
      form({ 'paid:b-001': '2636', 'paidnote:b-001': '  หลิว - Frame  ' }),
      TODAY,
      'transfer',
    );

    expect(drafts[0]!.note).toBe('หลิว - Frame');
  });

  it('applies the submission-wide method to every row', () => {
    const { drafts } = paymentsFromForm(
      rows(),
      form({ 'paid:b-001': '2636', 'paid:b-002': '4563' }),
      TODAY,
      'cash',
    );

    expect(drafts.map((d) => d.method)).toEqual(['cash', 'cash']);
  });

  /**
   * One typo must not cost the twenty-six rows that were fine — and the admin
   * has to be told which room it was, by the name they see on the screen.
   */
  it('reports a bad figure by room and still records the good rows', () => {
    const { drafts, errors } = paymentsFromForm(
      rows(),
      form({ 'paid:b-001': 'สองพัน', 'paid:b-002': '4563' }),
      TODAY,
      'transfer',
    );

    expect(drafts.map((d) => d.billId)).toEqual(['b-002']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('101');
  });

  /**
   * `Number()` accepts exponent notation, hex and `Infinity`, so a slip of
   * the hand on `2,636` could have recorded ฿26,000,000. Found by this test
   * failing when it was written the other way round.
   */
  it('refuses a figure that is not plainly a baht amount', () => {
    for (const typo of ['2,6e6', '0x100', 'Infinity', '2 636', '+2636']) {
      const { drafts, errors } = paymentsFromForm(
        rows(),
        form({ 'paid:b-001': typo }),
        TODAY,
        'transfer',
      );

      expect(drafts, `"${typo}" was recorded as a payment`).toEqual([]);
      expect(errors).toHaveLength(1);
    }
  });

  it('accepts satang, since a transfer is not obliged to be a round baht', () => {
    const { drafts } = paymentsFromForm(rows(), form({ 'paid:b-001': '2636.50' }), TODAY, 'cash');
    expect(drafts[0]!.amount).toBe(2636.5);
  });

  it('refuses zero and negative amounts rather than recording them', () => {
    const { drafts, errors } = paymentsFromForm(
      rows(),
      form({ 'paid:b-001': '0', 'paid:b-002': '-500' }),
      TODAY,
      'transfer',
    );

    expect(drafts).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  /**
   * Money cannot arrive for a bill that did not exist. Found by driving the
   * screen: it happily recorded a payment dated over a year before the cycle
   * it was against, and the receipt printed both dates side by side.
   */
  it('refuses a payment dated before the bill was issued, and names the day it was', () => {
    const { drafts, errors } = paymentsFromForm(
      rows(),
      form({ 'paid:b-001': '2636' }),
      new Date(2025, 2, 25),
      'transfer',
    );

    expect(drafts).toEqual([]);
    expect(errors[0]).toContain('26 มี.ค. 2568');
  });

  /** Late is ordinary. The due date is the 10th and this is well past it. */
  it('records a payment made long after the due date without complaint', () => {
    const { drafts, errors } = paymentsFromForm(
      rows(),
      form({ 'paid:b-001': '2636' }),
      new Date(2025, 5, 30),
      'transfer',
    );

    expect(errors).toEqual([]);
    expect(drafts).toHaveLength(1);
  });

  it('says nothing about a bill that was left blank, whatever the date', () => {
    const { errors } = paymentsFromForm(rows(), form({}), new Date(2020, 0, 1), 'transfer');
    expect(errors).toEqual([]);
  });

  it('addresses a bill by id, never by position', () => {
    expect(amountFieldName(BILLS[1]!)).toBe('paid:b-002');
    expect(noteFieldName(BILLS[1]!)).toBe('paidnote:b-002');
  });
});

describe('parsePaidOn', () => {
  it('defaults to today when the field is left alone', () => {
    expect(parsePaidOn('', TODAY)).toEqual({ date: TODAY, error: null });
    expect(parsePaidOn(null, TODAY)).toEqual({ date: TODAY, error: null });
  });

  /** Reconciliation runs behind the transfers it reconciles. */
  it('takes a พ.ศ. date, so a payment can be recorded on the day it arrived', () => {
    expect(parsePaidOn('28 มี.ค. 2568', TODAY).date).toEqual(new Date(2025, 2, 28));
  });

  /** A year typed as 2570 is a typo — nobody has received money tomorrow. */
  it('refuses a date in the future', () => {
    const { date, error } = parsePaidOn('3 เม.ย. 2568', TODAY);

    expect(date).toBeNull();
    expect(error).toContain('อนาคต');
  });

  it('accepts today itself, which is the ordinary case', () => {
    expect(parsePaidOn('2 เม.ย. 2568', TODAY).date).toEqual(TODAY);
  });

  it('refuses a date it cannot read and says what one looks like', () => {
    const { date, error } = parsePaidOn('2025-03-28', TODAY);

    expect(date).toBeNull();
    expect(error).toContain('2 เม.ย. 2568');
  });
});

