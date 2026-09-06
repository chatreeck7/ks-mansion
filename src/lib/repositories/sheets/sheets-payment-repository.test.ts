import { describe, expect, it } from 'vitest';
import { createInMemorySheets } from '../memory/in-memory-sheets';
import { createSheetsPaymentRepository } from './sheets-payment-repository';

const HEADER = ['id', 'bill_id', 'paid_on', 'amount', 'method', 'note', 'archived'];

function client(rows: string[][]) {
  return createInMemorySheets({ payments: [HEADER, ...rows] });
}

function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const defaults: Record<string, string> = {
    id: 'p-001',
    bill_id: 'b-001',
    paid_on: '28 มี.ค. 2568',
    amount: '2636',
    method: 'transfer',
    note: '',
    archived: 'FALSE',
  };
  const merged: Record<string, string | undefined> = { ...defaults, ...overrides };
  return HEADER.map((c) => merged[c] ?? '');
}

const repo = (rows: string[][]) => createSheetsPaymentRepository(client(rows));

const DRAFT = {
  billId: 'b-002',
  paidOn: new Date(2025, 3, 2),
  amount: 4563,
  method: 'transfer' as const,
  note: null,
};

describe('createSheetsPaymentRepository', () => {
  it('parses a well-formed row', async () => {
    const [payment] = await repo([row()]).listPayments();

    expect(payment).toEqual({
      id: 'p-001',
      billId: 'b-001',
      paidOn: new Date(2025, 2, 28),
      amount: 2636,
      method: 'transfer',
      note: null,
      archived: false,
    });
  });

  it('reads an amount the sheet has formatted with separators', async () => {
    const [payment] = await repo([row({ amount: '4,563' })]).listPayments();
    expect(payment!.amount).toBe(4563);
  });

  it('keeps the note that says who the transfer actually came from', async () => {
    // The collection form's own footer: a transfer arrives under a handle
    // that is not the tenant's name.
    const [payment] = await repo([row({ note: 'หลิว - Frame' })]).listPayments();
    expect(payment!.note).toBe('หลิว - Frame');
  });

  it('reads เงินสด as a method of its own', async () => {
    const [payment] = await repo([row({ method: 'cash' })]).listPayments();
    expect(payment!.method).toBe('cash');
  });

  it('fails the row on a method it does not know', async () => {
    await expect(repo([row({ method: 'promptpay' })]).listPayments()).rejects.toThrow(/"method"/);
  });

  it('fails the row on a date that is not พ.ศ. text', async () => {
    await expect(repo([row({ paid_on: '2025-03-28' })]).listPayments()).rejects.toThrow(
      /is not a Thai/,
    );
  });

  it('fails the row on a payment with no bill behind it', async () => {
    await expect(repo([row({ bill_id: '' })]).listPayments()).rejects.toThrow(/"bill_id"/);
  });

  /**
   * Zero is the absence of a payment, and a row asserting one would make a
   * bill read as part-settled by nothing at all.
   */
  it('fails the row on a zero amount', async () => {
    await expect(repo([row({ amount: '0' })]).listPayments()).rejects.toThrow(
      /"amount" must be greater than 0/,
    );
  });

  /** A refund is `move_out_paid` on the lease, with its own sign convention. */
  it('fails the row on a negative amount rather than reading it as a refund', async () => {
    await expect(repo([row({ amount: '-1244' })]).listPayments()).rejects.toThrow(
      /"amount" must be greater than 0/,
    );
  });

  it('leaves a voided payment out of the list but still resolves it by id', async () => {
    const payments = repo([row({ archived: 'TRUE' })]);

    expect(await payments.listPayments()).toEqual([]);
    expect(await payments.getPayment('p-001')).toMatchObject({ archived: true });
  });
});

describe('recordPayment', () => {
  it('appends a row and reads it back', async () => {
    const payments = repo([row()]);
    const recorded = await payments.recordPayment(DRAFT);

    expect(recorded.id).toBe('p-002');
    expect(await payments.getPayment('p-002')).toMatchObject({
      billId: 'b-002',
      paidOn: new Date(2025, 3, 2),
      amount: 4563,
      method: 'transfer',
    });
  });

  /** Many payments to one bill: แบ่งจ่าย is normal, not an error. */
  it('records a second payment against a bill that already has one', async () => {
    const payments = repo([row({ amount: '2000' })]);
    await payments.recordPayment({ ...DRAFT, billId: 'b-001', amount: 636 });

    expect(await payments.listPaymentsForBill('b-001')).toHaveLength(2);
  });

  it('refuses a non-positive amount with the sentence that says where a refund goes', async () => {
    const payments = repo([]);

    await expect(payments.recordPayment({ ...DRAFT, amount: 0 })).rejects.toThrow(
      /move_out_paid/,
    );
    await expect(payments.recordPayment({ ...DRAFT, amount: -100 })).rejects.toThrow(
      /move_out_paid/,
    );
    expect(await payments.listPayments()).toEqual([]);
  });

  it('trims a note, so whitespace is not a note', async () => {
    const payments = repo([]);
    const recorded = await payments.recordPayment({ ...DRAFT, note: '   ' });

    expect(recorded.note).toBeNull();
  });

  it('writes the date as พ.ศ. text the reader gets back unchanged', async () => {
    const payments = repo([]);
    const recorded = await payments.recordPayment({ ...DRAFT, paidOn: new Date(2025, 3, 10) });

    expect((await payments.getPayment(recorded.id))!.paidOn).toEqual(new Date(2025, 3, 10));
  });
});

describe('voidPayment', () => {
  it('withdraws the row without freeing its id', async () => {
    const payments = repo([row()]);
    await payments.voidPayment('p-001');

    expect(await payments.listPayments()).toEqual([]);
    // The next payment is p-002: a voided receipt keeps its number forever,
    // or the next one inherits its history.
    expect((await payments.recordPayment(DRAFT)).id).toBe('p-002');
  });
});
