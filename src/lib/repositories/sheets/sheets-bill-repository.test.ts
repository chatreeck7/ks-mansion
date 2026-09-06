import { describe, expect, it } from 'vitest';
import { createInMemorySheets } from '../memory/in-memory-sheets';
import { createSheetsBillRepository } from './sheets-bill-repository';

const HEADER = [
  'id', 'room_id', 'lease_id', 'cycle', 'issue_date', 'due_date',
  'rent_amount', 'electricity_amount', 'water_amount', 'total_amount',
  'arrears_note', 'archived',
];

function client(rows: string[][]) {
  return createInMemorySheets({ bills: [HEADER, ...rows] });
}

function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const defaults: Record<string, string> = {
    id: 'b-001',
    room_id: '101',
    lease_id: 'l-001',
    cycle: '2025-03',
    issue_date: '26 มี.ค. 2568',
    due_date: '10 เม.ย. 2568',
    rent_amount: '2200',
    electricity_amount: '336',
    water_amount: '200',
    total_amount: '2736',
    arrears_note: '',
    archived: 'FALSE',
  };
  const merged: Record<string, string | undefined> = { ...defaults, ...overrides };
  return HEADER.map((c) => merged[c] ?? '');
}

const repo = (rows: string[][]) => createSheetsBillRepository(client(rows));

const DRAFT = {
  roomId: '105',
  leaseId: 'l-004',
  cycle: '2025-03',
  issueDate: new Date(2025, 2, 26),
  dueDate: new Date(2025, 3, 10),
  rentAmount: 2500,
  electricityAmount: 420,
  waterAmount: 100,
  arrearsNote: null,
};

describe('createSheetsBillRepository', () => {
  it('parses a well-formed row', async () => {
    const [bill] = await repo([row()]).listBills();

    expect(bill).toEqual({
      id: 'b-001',
      roomId: '101',
      leaseId: 'l-001',
      cycle: '2025-03',
      issueDate: new Date(2025, 2, 26),
      dueDate: new Date(2025, 3, 10),
      rentAmount: 2200,
      electricityAmount: 336,
      waterAmount: 200,
      arrearsNote: null,
      archived: false,
    });
  });

  it('accepts a bill with no tenancy behind it', async () => {
    // A common space can be billed with no lease; requiring one would make
    // that unrepresentable.
    const [bill] = await repo([row({ lease_id: '' })]).listBills();
    expect(bill?.leaseId).toBeNull();
  });

  /** A room under แจ้งออก: utilities only. Zero rent is a real charge. */
  it('accepts zero rent', async () => {
    const [bill] = await repo([
      row({ rent_amount: '0', total_amount: '536' }),
    ]).listBills();

    expect(bill).toMatchObject({ rentAmount: 0, electricityAmount: 336, waterAmount: 200 });
  });

  it('refuses a negative charge', async () => {
    await expect(repo([row({ water_amount: '-100' })]).listBills()).rejects.toThrow(
      /water_amount/,
    );
  });

  it('refuses a due date before the issue date', async () => {
    await expect(
      repo([row({ due_date: '1 มี.ค. 2568' })]).listBills(),
    ).rejects.toThrow(/due_date/);
  });

  /**
   * The stored total is checked, never believed. A hand-edited sheet is
   * exactly where the two would drift, and a silently wrong total is a bill
   * somebody collects the wrong amount against.
   */
  it('refuses a total that disagrees with the charges, naming both', async () => {
    const promise = repo([row({ total_amount: '9999' })]).listBills();

    await expect(promise).rejects.toThrow(/total_amount/);
    await expect(promise).rejects.toThrow(/2736/);
  });

  it('names the missing column rather than failing vaguely', async () => {
    const sheets = createInMemorySheets({
      bills: [HEADER.filter((c) => c !== 'arrears_note'), []],
    });

    await expect(createSheetsBillRepository(sheets).listBills()).rejects.toThrow(
      /missing required column "arrears_note"/,
    );
  });
});

describe('issuing a bill', () => {
  it('computes the total rather than taking one', async () => {
    const sheets = client([]);
    const bills = createSheetsBillRepository(sheets);

    const issued = await bills.issueBill(DRAFT);

    expect(issued.id).toBe('b-001');
    // 2500 + 420 + 100, written into the column the reader will check.
    expect(sheets.rowsOf('bills')[1]).toContain('3020');
    expect(await bills.getBill('b-001')).toMatchObject({ rentAmount: 2500 });
  });

  it('writes the dates back in พ.ศ., so they read back unchanged', async () => {
    const sheets = client([]);
    const bills = createSheetsBillRepository(sheets);

    await bills.issueBill(DRAFT);

    expect(sheets.rowsOf('bills')[1]).toContain('26 มี.ค. 2568');
    expect((await bills.getBill('b-001'))?.dueDate).toEqual(new Date(2025, 3, 10));
  });

  it('appends rather than replacing — an issued bill is history', async () => {
    const sheets = client([row()]);
    const bills = createSheetsBillRepository(sheets);

    await bills.issueBill({ ...DRAFT, roomId: '101' });

    expect(sheets.rowsOf('bills')).toHaveLength(3);
    expect(await bills.getBill('b-001')).toMatchObject({ rentAmount: 2200 });
  });

  it('refuses a draft it could not read back, and writes nothing', async () => {
    const sheets = client([]);
    const bills = createSheetsBillRepository(sheets);

    await expect(bills.issueBill({ ...DRAFT, waterAmount: -1 })).rejects.toThrow(/water_amount/);
    expect(sheets.writeCount()).toBe(0);
  });
});

describe('finding what has already been issued', () => {
  const rows = [
    row({ id: 'b-001', room_id: '101', cycle: '2025-03' }),
    row({ id: 'b-002', room_id: '102', cycle: '2025-03' }),
    row({ id: 'b-003', room_id: '101', cycle: '2025-04', issue_date: '26 เม.ย. 2568',
          due_date: '10 พ.ค. 2568' }),
  ];

  it('lists a cycle, which is what a collection sheet is built from', async () => {
    const bills = await repo(rows).listBillsForCycle('2025-03');
    expect(bills.map((b) => b.roomId)).toEqual(['101', '102']);
  });

  it('lists a room across cycles', async () => {
    const bills = await repo(rows).listBillsForRoom('101');
    expect(bills.map((b) => b.cycle)).toEqual(['2025-03', '2025-04']);
  });

  /** The guard against issuing a cycle twice — the sheet would take both. */
  it('finds a room existing bill for a cycle, or nothing', async () => {
    expect(await repo(rows).findBill('101', '2025-03')).toMatchObject({ id: 'b-001' });
    expect(await repo(rows).findBill('105', '2025-03')).toBeNull();
  });
});

describe('arrears annotation', () => {
  /**
   * The one field writable after issue. It changes no amount, which is why
   * it is not a violation of append-only — see the repository interface.
   */
  it('adds a note without touching the charges', async () => {
    const bills = repo([row()]);

    const annotated = await bills.annotateArrears('b-001', 'ยอดค้าง 1,169');

    expect(annotated.arrearsNote).toBe('ยอดค้าง 1,169');
    expect(annotated).toMatchObject({ rentAmount: 2200, electricityAmount: 336, waterAmount: 200 });
  });

  it('clears a note, and treats blank as cleared', async () => {
    const bills = repo([row({ arrears_note: 'ยอดค้าง 1,169' })]);

    expect((await bills.annotateArrears('b-001', null)).arrearsNote).toBeNull();
    expect((await bills.annotateArrears('b-001', '   ')).arrearsNote).toBeNull();
  });

  it('is free text, never a number the console interprets', async () => {
    const bills = repo([row()]);

    // ค้างประกัน is a different fact from ยอดค้าง, and only a person knows
    // which this is. The console stores the sentence.
    const annotated = await bills.annotateArrears('b-001', 'ค้างประกัน 1,000');
    expect(annotated.arrearsNote).toBe('ค้างประกัน 1,000');
  });
});
