import { describe, expect, it } from 'vitest';
import { createInMemorySheets } from '../memory/in-memory-sheets';
import { createSheetsLeaseRepository } from './sheets-lease-repository';

const HEADER = [
  'id', 'room_id', 'tenant_id', 'start_date', 'end_date', 'signed_date',
  'rent_rate', 'deposit', 'advance_rent', 'occupant_count',
  'end_reason', 'previous_lease_id', 'archived',
];

function client(rows: string[][]) {
  return createInMemorySheets({ leases: [HEADER, ...rows] });
}

function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const defaults: Record<string, string> = {
    id: 'l-001',
    room_id: '101',
    tenant_id: 't-001',
    start_date: '1 ม.ค. 2568',
    end_date: '',
    signed_date: '28 ธ.ค. 2567',
    rent_rate: '2200',
    deposit: '5000',
    advance_rent: '2200',
    occupant_count: '2',
    end_reason: '',
    previous_lease_id: '',
    archived: 'FALSE',
  };
  const merged: Record<string, string | undefined> = { ...defaults, ...overrides };
  return HEADER.map((c) => merged[c] ?? '');
}

describe('createSheetsLeaseRepository', () => {
  it('parses a well-formed row, Thai dates included', async () => {
    const [lease] = await createSheetsLeaseRepository(client([row()])).listLeases();
    expect(lease).toEqual({
      archived: false,
      id: 'l-001',
      roomId: '101',
      tenantId: 't-001',
      startDate: new Date(2025, 0, 1),
      endDate: null,
      signedDate: new Date(2024, 11, 28),
      rentRate: 2200,
      deposit: 5000,
      advanceRent: 2200,
      occupantCount: 2,
      endReason: null,
      previousLeaseId: null,
    });
  });

  it('accepts the numeric Thai date form too', async () => {
    const [lease] = await createSheetsLeaseRepository(
      client([row({ start_date: '1/3/2568' })]),
    ).listLeases();
    expect(lease?.startDate).toEqual(new Date(2025, 2, 1));
  });

  it('tolerates thousands separators in money columns', async () => {
    // An admin copying from paperwork will naturally type "5,000" — and
    // Sheets returns a number-formatted column that way regardless.
    const [lease] = await createSheetsLeaseRepository(
      client([row({ deposit: '5,000' })]),
    ).listLeases();
    expect(lease?.deposit).toBe(5000);
  });

  it('treats a blank end_date as open-ended rather than an error', async () => {
    const [lease] = await createSheetsLeaseRepository(client([row({ end_date: '' })])).listLeases();
    expect(lease?.endDate).toBeNull();
  });

  // วันที่ทำสัญญา is its own field: a tenancy is often signed before it
  // begins, and KS-31 has to print the signing date, not the start date.
  it('keeps the signing date separate from the start date', async () => {
    const [lease] = await createSheetsLeaseRepository(
      client([row({ signed_date: '20 ธ.ค. 2567', start_date: '1 ม.ค. 2568' })]),
    ).listLeases();
    expect(lease?.signedDate).toEqual(new Date(2024, 11, 20));
    expect(lease?.startDate).toEqual(new Date(2025, 0, 1));
  });

  it('treats a blank signed_date as simply not recorded', async () => {
    const [lease] = await createSheetsLeaseRepository(
      client([row({ signed_date: '' })]),
    ).listLeases();
    expect(lease?.signedDate).toBeNull();
  });

  it('reads how a tenancy ended, including หนี', async () => {
    const ended = { end_date: '31 ธ.ค. 2568' };
    const repo = createSheetsLeaseRepository(
      client([
        row({ id: 'a', ...ended, end_reason: 'normal' }),
        row({ id: 'b', ...ended, end_reason: 'absconded' }),
        row({ id: 'c' }),
      ]),
    );
    expect((await repo.listLeases()).map((l) => l.endReason)).toEqual([
      'normal',
      'absconded',
      null,
    ]);
  });

  it('keeps a room transfer linked to the tenancy it continues', async () => {
    const [, transfer] = await createSheetsLeaseRepository(
      client([
        row({ id: 'l-002', room_id: '102', end_date: '28 ก.พ. 2569', end_reason: 'normal' }),
        row({ id: 'l-004', room_id: '105', start_date: '1 มี.ค. 2569', previous_lease_id: 'l-002' }),
      ]),
    ).listLeases();
    expect(transfer?.previousLeaseId).toBe('l-002');
  });

  it('reads the occupant count that drives ค่าน้ำ', async () => {
    const [lease] = await createSheetsLeaseRepository(
      client([row({ occupant_count: '3' })]),
    ).listLeases();
    expect(lease?.occupantCount).toBe(3);
  });

  it('filters by room and by tenant', async () => {
    const repo = createSheetsLeaseRepository(
      client([
        row({ id: 'a', room_id: '101', tenant_id: 't-1' }),
        row({ id: 'b', room_id: '102', tenant_id: 't-1' }),
        row({ id: 'c', room_id: '101', tenant_id: 't-2' }),
      ]),
    );
    expect((await repo.listLeasesForRoom('101')).map((l) => l.id)).toEqual(['a', 'c']);
    expect((await repo.listLeasesForTenant('t-1')).map((l) => l.id)).toEqual(['a', 'b']);
  });

  describe('validation', () => {
    it('rejects a Gregorian year rather than reinterpreting it', async () => {
      // 2026 - 543 would be 1483. The whole reason dates are stored in
      // พ.ศ. is that this mistake fails loudly instead of silently.
      const repo = createSheetsLeaseRepository(client([row({ start_date: '1/3/2026' })]));
      await expect(repo.listLeases()).rejects.toThrow(/not a Thai \(พ\.ศ\.\) date/);
    });

    it('rejects a date that does not exist', async () => {
      const repo = createSheetsLeaseRepository(client([row({ start_date: '30/2/2568' })]));
      await expect(repo.listLeases()).rejects.toThrow(/not a Thai/);
    });

    it('rejects an end_date before the start_date', async () => {
      const repo = createSheetsLeaseRepository(
        client([row({ start_date: '1 มี.ค. 2568', end_date: '1 ม.ค. 2568' })]),
      );
      await expect(repo.listLeases()).rejects.toThrow(/is before "start_date"/);
    });

    it('rejects a negative amount', async () => {
      const repo = createSheetsLeaseRepository(client([row({ deposit: '-100' })]));
      await expect(repo.listLeases()).rejects.toThrow(/cannot be negative/);
    });

    it('rejects a non-numeric amount', async () => {
      const repo = createSheetsLeaseRepository(client([row({ rent_rate: 'ฟรี' })]));
      await expect(repo.listLeases()).rejects.toThrow(/"rent_rate" is not a number/);
    });

    // The source spreadsheet's own instruction: leave the headcount out and
    // "จะคำนวนผิดพลาด". A default of 1 would produce a plausible-looking
    // water charge that is quietly wrong, which is worse than no bill.
    it('refuses a blank occupant_count rather than defaulting it', async () => {
      const repo = createSheetsLeaseRepository(client([row({ occupant_count: '' })]));
      await expect(repo.listLeases()).rejects.toThrow(/"occupant_count" is not a number/);
    });

    it('refuses a fractional or negative occupant count', async () => {
      for (const bad of ['1.5', '-1']) {
        const repo = createSheetsLeaseRepository(client([row({ occupant_count: bad })]));
        await expect(repo.listLeases(), bad).rejects.toThrow(/whole number of people/);
      }
    });

    // ร้านซักผ้า is a shop on its own water meter, not a home — zero
    // occupants is a real record there, not a missing one.
    it('accepts zero occupants, which is a shop rather than a missing value', async () => {
      const [lease] = await createSheetsLeaseRepository(
        client([row({ occupant_count: '0' })]),
      ).listLeases();
      expect(lease?.occupantCount).toBe(0);
    });

    it('refuses an end_reason on a lease with no end date', async () => {
      // Otherwise this reads as a running tenancy that also absconded, and
      // every later summary counts the room twice.
      const repo = createSheetsLeaseRepository(
        client([row({ end_reason: 'absconded', end_date: '' })]),
      );
      await expect(repo.listLeases()).rejects.toThrow(/a lease that ended needs an end date/);
    });

    it('refuses an unrecognised end_reason', async () => {
      const repo = createSheetsLeaseRepository(
        client([row({ end_date: '31 ธ.ค. 2568', end_reason: 'หนี' })]),
      );
      await expect(repo.listLeases()).rejects.toThrow(
        /"end_reason" must be one of "normal", "absconded", got "หนี"/,
      );
    });

    it('refuses a previous_lease_id pointing at its own row', async () => {
      const repo = createSheetsLeaseRepository(client([row({ id: 'x', previous_lease_id: 'x' })]));
      await expect(repo.listLeases()).rejects.toThrow(/points at its own row/);
    });

    it('requires the foreign keys', async () => {
      await expect(
        createSheetsLeaseRepository(client([row({ room_id: '' })])).listLeases(),
      ).rejects.toThrow(/missing "room_id"/);
      await expect(
        createSheetsLeaseRepository(client([row({ tenant_id: '' })])).listLeases(),
      ).rejects.toThrow(/missing "tenant_id"/);
    });

    it('throws on a duplicate id and names both rows', async () => {
      const repo = createSheetsLeaseRepository(client([row({ id: 'x' }), row({ id: 'x' })]));
      await expect(repo.listLeases()).rejects.toThrow(
        /row 3: duplicate id "x", already used on row 2/,
      );
    });

    it('skips a row carrying only a note, without demanding an id for it', async () => {
      const noteRow = HEADER.map(() => '');
      noteRow[HEADER.indexOf('previous_lease_id')] = '-- archived below --';
      const repo = createSheetsLeaseRepository(client([row(), noteRow]));
      expect(await repo.listLeases()).toHaveLength(1);
    });
  });
});
