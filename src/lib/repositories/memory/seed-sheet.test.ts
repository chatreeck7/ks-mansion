import { describe, expect, it } from 'vitest';
import { formatThaiDate } from '@/lib/format/thai';
import { isUnit } from '@/lib/models/room';
import { createSheetsLeaseRepository } from '../sheets/sheets-lease-repository';
import { createSheetsRoomRepository } from '../sheets/sheets-room-repository';
import { createSheetsTenantRepository } from '../sheets/sheets-tenant-repository';
import { getTenantRepository } from '../index';
import { createSeedSheets } from './seed-sheet';

/** A fresh spreadsheet per test, so one test's writes cannot reach another. */
function repositories() {
  const sheets = createSeedSheets();
  return {
    sheets,
    rooms: createSheetsRoomRepository(sheets),
    tenants: createSheetsTenantRepository(sheets),
    leases: createSheetsLeaseRepository(sheets),
  };
}

/**
 * Every assertion here reads through the **real** repository, so passing
 * means the seed rows satisfy the same contract `KS_Mansion_DB` has to. A
 * seed that could not be read back used to be possible; it is now a failure.
 */
describe('the seed sheet reads through the real repositories', () => {
  it('carries the KS-7 registry: 27 spaces, 25 of them lettable units', async () => {
    const rooms = await repositories().rooms.listRooms();

    expect(rooms).toHaveLength(27);
    expect(rooms.filter(isUnit)).toHaveLength(25);
  });

  it('keeps rent as rent, not a month total', async () => {
    const byId = new Map((await repositories().rooms.listRooms()).map((r) => [r.id, r]));

    // 101 read 2,636 before the correction — 2,200 rent + 336 ไฟ + 100 น้ำ.
    expect(byId.get('101')?.rentRate).toBe(2200);
    expect(byId.get('301')?.rentRate).toBe(2800);
  });

  it('gives the common spaces their Thai labels, from detail not room_number', async () => {
    const byId = new Map((await repositories().rooms.listRooms()).map((r) => [r.id, r]));

    expect(byId.get('laundry')).toMatchObject({
      label: 'ร้านซักผ้า',
      kind: 'common',
      hasMeter: true,
      rentRate: 1800,
    });

    // The undercroft deliberately differs from the live sheet, so its label
    // is the tell that you are on seed data rather than reading Sheets.
    expect(byId.get('undercroft')).toMatchObject({
      label: 'ห้องใต้ถุน',
      kind: 'common',
      floor: 0,
      hasMeter: false,
      // No rate on record — not zero, which would assert the space is free.
      rentRate: null,
    });
  });

  it('marks exactly the three rooms that are out of service', async () => {
    const rooms = await repositories().rooms.listRooms();
    const ids = rooms.filter((r) => r.status === 'maintenance').map((r) => r.id);

    expect(ids.sort()).toEqual(['104', '204', '209']);
  });

  /**
   * Blank is a third state, not `false`. Nothing records TV or fridge yet,
   * and inventing 54 cells to avoid a null would be the "don't invent data"
   * ruling turned upside down.
   */
  it('leaves TV and fridge unrecorded rather than guessing them', async () => {
    const rooms = await repositories().rooms.listRooms();

    expect(rooms.every((r) => r.appliances.tv === null)).toBe(true);
    expect(rooms.every((r) => r.appliances.fridge === null)).toBe(true);
    // Aircon *is* on file — it is the one appliance the source data records.
    expect(rooms.every((r) => r.appliances.aircon !== null)).toBe(true);
  });

  it('covers the tenant profiles the empty states need', async () => {
    const tenants = await repositories().tenants.listTenants();

    expect(tenants.map((t) => t.id)).toEqual(['t-001', 't-002', 't-003']);
    // Graded, with a full address.
    expect(tenants[0]).toMatchObject({ evaluationGrade: 'A', nickname: 'ชาย' });
    // Ungraded, sparse address, carries a note.
    expect(tenants[1]).toMatchObject({ evaluationGrade: null, note: '(เลี้ยงแมว)' });
    expect(tenants[1]!.address).toMatchObject({ road: '', province: 'ตัวอย่าง' });
  });

  it('parses the พ.ศ. lease dates back to the calendar dates they mean', async () => {
    const lease = await repositories().leases.getLease('l-001');

    expect(lease!.startDate.getFullYear()).toBe(2025);
    expect(lease!.startDate.getMonth()).toBe(0);
    expect(lease!.startDate.getDate()).toBe(1);
    expect(formatThaiDate(lease!.startDate)).toBe('1 ม.ค. 2568');
    expect(lease!.endDate).toBeNull();
  });

  it('covers the four lease shapes worth seeing locally', async () => {
    const leases = await repositories().leases.listLeases();

    expect(leases.map((l) => l.id)).toEqual(['l-001', 'l-002', 'l-003', 'l-004']);
    expect(leases[0]!.endDate).toBeNull();
    expect(leases[1]!.endReason).toBe('normal');
    expect(leases[2]!.endReason).toBe('absconded');
    // A room transfer: one tenancy across 102 → 105, not two short ones.
    expect(leases[3]).toMatchObject({ roomId: '105', previousLeaseId: 'l-002' });
  });
});

/**
 * The reason this card existed.
 *
 * The old hand-written memory store validated nothing, so these writes all
 * succeeded locally and threw only against the real sheet. They now fail the
 * same way in both places, because there is only one implementation left.
 */
describe('the seed store refuses what Sheets would refuse', () => {
  const draft = {
    fullName: 'ทดสอบ ทดสอบ',
    nickname: '',
    idCardLast4: '1234',
    phone: '',
    occupation: '',
    evaluationGrade: null,
    note: '',
    address: {
      houseNo: '', road: '', subdistrict: '',
      district: '', province: '', postcode: '',
    },
  };

  it('rejects a full national id in id_card_last4', async () => {
    const { tenants } = repositories();

    await expect(
      tenants.createTenant({ ...draft, idCardLast4: '1234567890123' }),
    ).rejects.toThrow(/id_card_last4/);
  });

  it('writes nothing at all when it refuses', async () => {
    const { tenants, sheets } = repositories();
    const before = sheets.writeCount();

    await expect(
      tenants.createTenant({ ...draft, idCardLast4: '1234567890123' }),
    ).rejects.toThrow();

    expect(sheets.writeCount()).toBe(before);
    expect(await tenants.listTenants()).toHaveLength(3);
  });

  it('rejects a lease that ended for a reason but has no end date', async () => {
    const { leases } = repositories();

    await expect(leases.updateLease('l-001', { endReason: 'absconded' })).rejects.toThrow(
      /end_reason/,
    );
  });

  it('still accepts a valid write, so the guard is not simply refusing everything', async () => {
    const { tenants } = repositories();

    const created = await tenants.createTenant(draft);
    expect(created.id).toBe('t-004');
    expect(await tenants.listTenants()).toHaveLength(4);
  });

  /** Soft delete, schema rule 7 — the row stays, the flag goes on. */
  it('hides an archived tenant from the list but keeps them reachable by id', async () => {
    const { tenants } = repositories();

    await tenants.archiveTenant('t-002');

    expect((await tenants.listTenants()).map((t) => t.id)).toEqual(['t-001', 't-003']);
    expect(await tenants.getTenant('t-002')).toMatchObject({ id: 't-002', archived: true });
  });

  it("never hands an archived tenant's id to the next one created", async () => {
    const { tenants } = repositories();

    await tenants.archiveTenant('t-003');
    const created = await tenants.createTenant(draft);

    expect(created.id).toBe('t-004');
  });

  it('leaves columns it does not model untouched', async () => {
    const { tenants, sheets } = repositories();

    await tenants.updateTenant('t-002', { phone: '080-999-9999' });
    const row = sheets.rowsOf('tenants')[2]!;

    // The note is the admin's, and this edit was about a phone number.
    expect(row).toContain('(เลี้ยงแมว)');
    expect(row).toContain('080-999-9999');
  });
});

/**
 * The tests above build the repository directly, so they would have passed
 * before this change too — the Sheets path always validated. What actually
 * changed is what the **composition root** hands back with no credentials
 * configured, which is what `npm run dev` and every memory-backed test get.
 *
 * That used to be a separate hand-written store that validated nothing, so
 * this exact call resolved instead of rejecting. This is the regression
 * guard for the card.
 *
 * Safe against the shared seed despite it being a module-level singleton:
 * a refused write writes nothing, so nothing here can leak into another test.
 */
describe('the composition root fallback validates too', () => {
  it('rejects through getTenantRepository, not only through a hand-built one', async () => {
    await expect(
      getTenantRepository({}).createTenant({
        fullName: 'ทดสอบ ทดสอบ',
        nickname: '',
        idCardLast4: '1234567890123',
        phone: '',
        occupation: '',
        evaluationGrade: null,
        note: '',
        address: {
          houseNo: '', road: '', subdistrict: '',
          district: '', province: '', postcode: '',
        },
      }),
    ).rejects.toThrow(/id_card_last4/);
  });

  it('rejects an unreadable update through the composition root as well', async () => {
    await expect(
      getTenantRepository({}).updateTenant('t-001', { idCardLast4: 'abcd' }),
    ).rejects.toThrow(/id_card_last4/);
  });
});
