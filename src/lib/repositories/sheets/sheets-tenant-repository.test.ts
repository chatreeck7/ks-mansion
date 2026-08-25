import { describe, expect, it } from 'vitest';
import { createSheetsTenantRepository } from './sheets-tenant-repository';
import type { SheetsClient } from './sheets-client';

const HEADER = ['id', 'full_name', 'nickname', 'id_card_last4', 'address', 'phone'];

function client(rows: string[][]): SheetsClient {
  return { async getTabValues() { return [HEADER, ...rows]; } };
}

function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const defaults: Record<string, string> = {
    id: 't-001',
    full_name: 'สมชาย ใจดี',
    nickname: 'ชาย',
    id_card_last4: '1234',
    address: '99 หมู่ 4 ต.ในเมือง',
    phone: '081-234-5678',
  };
  const merged: Record<string, string | undefined> = { ...defaults, ...overrides };
  return HEADER.map((c) => merged[c] ?? '');
}

describe('createSheetsTenantRepository', () => {
  it('parses a well-formed row', async () => {
    const [tenant] = await createSheetsTenantRepository(client([row()])).listTenants();
    expect(tenant).toEqual({
      id: 't-001',
      fullName: 'สมชาย ใจดี',
      nickname: 'ชาย',
      idCardLast4: '1234',
      address: '99 หมู่ 4 ต.ในเมือง',
      phone: '081-234-5678',
    });
  });

  it('allows a blank nickname — it is optional, unlike the rest', async () => {
    const [tenant] = await createSheetsTenantRepository(client([row({ nickname: '' })])).listTenants();
    expect(tenant?.nickname).toBe('');
  });

  it('allows a blank id_card_last4, since it may simply not be recorded', async () => {
    const [tenant] = await createSheetsTenantRepository(
      client([row({ id_card_last4: '' })]),
    ).listTenants();
    expect(tenant?.idCardLast4).toBe('');
  });

  it('finds a tenant by id, and returns null for an unknown one', async () => {
    const repo = createSheetsTenantRepository(client([row({ id: 't-007' })]));
    expect((await repo.getTenant('t-007'))?.fullName).toBe('สมชาย ใจดี');
    expect(await repo.getTenant('t-999')).toBeNull();
  });

  it('finds a valid tenant even when an unrelated row is malformed', async () => {
    const repo = createSheetsTenantRepository(
      client([row({ id: 't-001' }), row({ id: 't-002', id_card_last4: 'bogus' })]),
    );
    expect((await repo.getTenant('t-001'))?.id).toBe('t-001');
  });

  describe('validation', () => {
    it('refuses a full ID card number rather than truncating it', async () => {
      // The whole point of the last-4 decision: if someone pastes a full
      // national ID into this column, storing or displaying a slice of it
      // would quietly defeat the reason the column is only four digits.
      const repo = createSheetsTenantRepository(client([row({ id_card_last4: '1234567890123' })]));
      await expect(repo.listTenants()).rejects.toThrow(/never the full number/);
    });

    it('refuses an id_card_last4 that is not four digits', async () => {
      for (const bad of ['12', '12345', 'abcd']) {
        const repo = createSheetsTenantRepository(client([row({ id_card_last4: bad })]));
        await expect(repo.listTenants(), bad).rejects.toThrow(/must be exactly 4 digits/);
      }
    });

    it('throws on a missing required cell', async () => {
      await expect(
        createSheetsTenantRepository(client([row({ full_name: '' })])).listTenants(),
      ).rejects.toThrow(/missing "full_name"/);
    });

    it('throws on a duplicate id and names both rows', async () => {
      const repo = createSheetsTenantRepository(client([row({ id: 't-001' }), row({ id: 't-001' })]));
      await expect(repo.listTenants()).rejects.toThrow(
        /row 3: duplicate id "t-001", already used on row 2/,
      );
    });

    it('throws when the header is missing a required column', async () => {
      const bare: SheetsClient = {
        async getTabValues() { return [['id', 'full_name'], ['t-1', 'สมชาย']]; },
      };
      await expect(createSheetsTenantRepository(bare).listTenants()).rejects.toThrow(
        /missing required column "id_card_last4"/,
      );
    });

    it('skips a row that is blank in every required column', async () => {
      const noteRow = ['', '', 'ย้ายออกแล้ว', '', '', ''];
      const repo = createSheetsTenantRepository(client([row(), noteRow]));
      expect(await repo.listTenants()).toHaveLength(1);
    });
  });
});
