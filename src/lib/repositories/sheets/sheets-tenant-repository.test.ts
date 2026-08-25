import { describe, expect, it } from 'vitest';
import { createSheetsTenantRepository } from './sheets-tenant-repository';
import type { SheetsClient } from './sheets-client';

const HEADER = [
  'id', 'full_name', 'nickname', 'id_card_last4', 'phone',
  'occupation', 'evaluation_grade', 'note',
  'address_house_no', 'address_road', 'address_subdistrict',
  'address_district', 'address_province', 'address_postcode',
];

function client(rows: string[][]): SheetsClient {
  return { async getTabValues() { return [HEADER, ...rows]; } };
}

function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const defaults: Record<string, string> = {
    id: 't-001',
    full_name: 'สมชาย ใจดี',
    nickname: 'ชาย',
    id_card_last4: '1234',
    phone: '081-234-5678',
    occupation: 'ราชภัฏ/7-11',
    evaluation_grade: 'A',
    note: '(เลี้ยงแมว)',
    address_house_no: '99/1',
    address_road: 'มิตรภาพ',
    address_subdistrict: 'ในเมือง',
    address_district: 'เมือง',
    address_province: 'ขอนแก่น',
    address_postcode: '40000',
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
      phone: '081-234-5678',
      occupation: 'ราชภัฏ/7-11',
      evaluationGrade: 'A',
      note: '(เลี้ยงแมว)',
      address: {
        houseNo: '99/1',
        road: 'มิตรภาพ',
        subdistrict: 'ในเมือง',
        district: 'เมือง',
        province: 'ขอนแก่น',
        postcode: '40000',
      },
    });
  });

  it('allows a blank nickname — it is optional, unlike the name', async () => {
    const [tenant] = await createSheetsTenantRepository(client([row({ nickname: '' })])).listTenants();
    expect(tenant?.nickname).toBe('');
  });

  it('allows a blank id_card_last4, since it may simply not be recorded', async () => {
    const [tenant] = await createSheetsTenantRepository(
      client([row({ id_card_last4: '' })]),
    ).listTenants();
    expect(tenant?.idCardLast4).toBe('');
  });

  // Most tenants give a house number and little else. A sparse address is
  // the normal case, so it must read as a partial record rather than fail.
  it('reads a partly-filled address without inventing the missing parts', async () => {
    const [tenant] = await createSheetsTenantRepository(
      client([
        row({
          address_road: '',
          address_subdistrict: '',
          address_district: '',
          address_postcode: '',
        }),
      ]),
    ).listTenants();
    expect(tenant?.address).toEqual({
      houseNo: '99/1',
      road: '',
      subdistrict: '',
      district: '',
      province: 'ขอนแก่น',
      postcode: '',
    });
  });

  it('reads no grade as not-yet-assessed rather than a failing grade', async () => {
    const [tenant] = await createSheetsTenantRepository(
      client([row({ evaluation_grade: '' })]),
    ).listTenants();
    expect(tenant?.evaluationGrade).toBeNull();
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

    it('refuses a grade outside the sheet\'s own A/B/C legend', async () => {
      const repo = createSheetsTenantRepository(client([row({ evaluation_grade: 'ดี' })]));
      await expect(repo.listTenants()).rejects.toThrow(
        /"evaluation_grade" must be one of "A", "B", "C", got "ดี"/,
      );
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

    it('throws when the header is missing a contracted column', async () => {
      const bare: SheetsClient = {
        async getTabValues() { return [['id', 'full_name'], ['t-1', 'สมชาย']]; },
      };
      await expect(createSheetsTenantRepository(bare).listTenants()).rejects.toThrow(
        /missing required column "nickname"/,
      );
    });

    // The free-text columns hold no value on plenty of real rows, so their
    // *presence* is the only thing that can be checked. A typo'd header would
    // otherwise read as empty for every tenant, forever, without a word.
    it('throws when an optional-valued column is missing from the header', async () => {
      const noOccupation: SheetsClient = {
        async getTabValues() {
          const header = HEADER.filter((c) => c !== 'occupation');
          return [header, header.map(() => 'x')];
        },
      };
      await expect(createSheetsTenantRepository(noOccupation).listTenants()).rejects.toThrow(
        /missing required column "occupation"/,
      );
    });

    it('skips a row carrying only an admin note, without demanding an id for it', async () => {
      const noteRow = HEADER.map((c) => (c === 'note' ? 'ย้ายออกแล้ว' : ''));
      const repo = createSheetsTenantRepository(client([row(), noteRow]));
      expect(await repo.listTenants()).toHaveLength(1);
    });
  });
});
