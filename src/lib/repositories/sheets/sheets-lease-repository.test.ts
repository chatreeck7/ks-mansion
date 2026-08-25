import { describe, expect, it } from 'vitest';
import { createSheetsLeaseRepository } from './sheets-lease-repository';
import type { SheetsClient } from './sheets-client';

const HEADER = [
  'id', 'room_id', 'tenant_id', 'start_date', 'end_date',
  'rent_rate', 'deposit', 'advance_rent',
];

function client(rows: string[][]): SheetsClient {
  return { async getTabValues() { return [HEADER, ...rows]; } };
}

function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const defaults: Record<string, string> = {
    id: 'l-001',
    room_id: '101',
    tenant_id: 't-001',
    start_date: '1 ม.ค. 2568',
    end_date: '',
    rent_rate: '2636',
    deposit: '5000',
    advance_rent: '2636',
  };
  const merged: Record<string, string | undefined> = { ...defaults, ...overrides };
  return HEADER.map((c) => merged[c] ?? '');
}

describe('createSheetsLeaseRepository', () => {
  it('parses a well-formed row, Thai dates included', async () => {
    const [lease] = await createSheetsLeaseRepository(client([row()])).listLeases();
    expect(lease).toEqual({
      id: 'l-001',
      roomId: '101',
      tenantId: 't-001',
      startDate: new Date(2025, 0, 1),
      endDate: null,
      rentRate: 2636,
      deposit: 5000,
      advanceRent: 2636,
    });
  });

  it('accepts the numeric Thai date form too', async () => {
    const [lease] = await createSheetsLeaseRepository(
      client([row({ start_date: '1/3/2568' })]),
    ).listLeases();
    expect(lease?.startDate).toEqual(new Date(2025, 2, 1));
  });

  it('tolerates thousands separators in money columns', async () => {
    // An admin copying from paperwork will naturally type "5,000".
    const [lease] = await createSheetsLeaseRepository(
      client([row({ deposit: '5,000' })]),
    ).listLeases();
    expect(lease?.deposit).toBe(5000);
  });

  it('treats a blank end_date as open-ended rather than an error', async () => {
    const [lease] = await createSheetsLeaseRepository(client([row({ end_date: '' })])).listLeases();
    expect(lease?.endDate).toBeNull();
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
  });
});
