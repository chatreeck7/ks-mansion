import { describe, expect, it } from 'vitest';
import { createInMemorySheets, type InMemorySheets } from '../memory/in-memory-sheets';
import { createSheetsCrud } from './sheets-crud';
import { createSheetsLeaseRepository } from './sheets-lease-repository';
import { createSheetsRoomRepository } from './sheets-room-repository';
import { createSheetsTenantRepository } from './sheets-tenant-repository';
import { requireCell } from './tab-reader';

/**
 * The write path, exercised through the real repositories against a fake
 * spreadsheet.
 *
 * These assert on the **resulting sheet**, not on the calls made to get
 * there. Asserting on call arguments passes happily for a write that lands in
 * the wrong row, which is the bug class that matters most here: a bad read
 * can be fixed by fixing the code, a bad write has already changed somebody's
 * spreadsheet.
 */

const TENANT_HEADER = [
  'id', 'full_name', 'nickname', 'id_card_last4', 'phone',
  'occupation', 'evaluation_grade', 'note',
  'address_house_no', 'address_road', 'address_subdistrict',
  'address_district', 'address_province', 'address_postcode', 'archived',
];

function tenantRow(id: string, name: string): string[] {
  return [id, name, '', '1234', '081-000-0000', 'ค้าขาย', 'A', '', '9', '', '', '', '', '', 'FALSE'];
}

const EMPTY_ADDRESS = {
  houseNo: '', road: '', subdistrict: '', district: '', province: '', postcode: '',
};

const DRAFT = {
  fullName: 'สมหญิง ตัวอย่าง',
  nickname: 'หญิง',
  idCardLast4: '4321',
  address: { ...EMPTY_ADDRESS, houseNo: '5/2', province: 'ขอนแก่น' },
  phone: '081-111-1111',
  occupation: 'นักเรียน',
  evaluationGrade: 'B' as const,
  note: '',
};

function tenantsWith(rows: string[][]): InMemorySheets {
  return createInMemorySheets({ tenants: [TENANT_HEADER, ...rows] });
}

function cell(sheet: InMemorySheets, tab: string, rowNumber: number, column: string): string {
  const rows = sheet.rowsOf(tab);
  return rows[rowNumber - 1]![rows[0]!.indexOf(column)] ?? '';
}

describe('create', () => {
  it('appends a row and returns the stored record', async () => {
    const sheet = tenantsWith([tenantRow('t-001', 'สมชาย')]);
    const created = await createSheetsTenantRepository(sheet).createTenant(DRAFT);

    expect(created.id).toBe('t-002');
    expect(created.fullName).toBe('สมหญิง ตัวอย่าง');
    expect(sheet.rowsOf('tenants')).toHaveLength(3);
    expect(cell(sheet, 'tenants', 3, 'full_name')).toBe('สมหญิง ตัวอย่าง');
    expect(cell(sheet, 'tenants', 3, 'address_house_no')).toBe('5/2');
  });

  it('marks a new record as not archived rather than leaving the cell blank', async () => {
    const sheet = tenantsWith([tenantRow('t-001', 'สมชาย')]);
    await createSheetsTenantRepository(sheet).createTenant(DRAFT);
    expect(cell(sheet, 'tenants', 3, 'archived')).toBe('FALSE');
  });

  it('numbers from the highest existing id, not the row count', async () => {
    // Row count would say t-003; the ids in the sheet say t-013.
    const sheet = tenantsWith([tenantRow('t-012', 'ก'), tenantRow('t-004', 'ข')]);
    const created = await createSheetsTenantRepository(sheet).createTenant(DRAFT);
    expect(created.id).toBe('t-013');
  });

  it('ignores a hand-typed id that is not a number when picking the next one', async () => {
    const sheet = tenantsWith([tenantRow('t-002', 'ก'), tenantRow('t-old', 'ข')]);
    const created = await createSheetsTenantRepository(sheet).createTenant(DRAFT);
    expect(created.id).toBe('t-003');
  });

  /**
   * Rooms are the building's, not the console's. `RoomRepository` has no
   * create method at all, so this is normally a compile-time guarantee — the
   * runtime guard is the backstop for a spec that forgets an `idPrefix`.
   */
  it('refuses to create an entity that has no id prefix', async () => {
    const sheet = createInMemorySheets({ rooms: [['id', 'archived'], ['101', 'FALSE']] });
    const crud = createSheetsCrud<{ id: string; archived: boolean }, object>(sheet, {
      tabName: 'rooms',
      contract: { columns: ['id', 'archived'] },
      label: 'room',
      parse: (tab, row, rowNumber) => ({
        id: requireCell(tab, row, rowNumber, 'id'),
        archived: false,
      }),
      toRowValues: () => ({}),
    });

    await expect(crud.create({})).rejects.toThrow(/A room cannot be created through the console/);
  });
});

describe('update', () => {
  it('changes only the fields it was given', async () => {
    const sheet = tenantsWith([tenantRow('t-001', 'สมชาย')]);
    const updated = await createSheetsTenantRepository(sheet).updateTenant('t-001', {
      phone: '082-222-2222',
    });

    expect(updated.phone).toBe('082-222-2222');
    expect(updated.fullName).toBe('สมชาย');
    expect(cell(sheet, 'tenants', 2, 'occupation')).toBe('ค้าขาย');
  });

  it('writes the row in place rather than appending a second one', async () => {
    const sheet = tenantsWith([tenantRow('t-001', 'ก'), tenantRow('t-002', 'ข')]);
    await createSheetsTenantRepository(sheet).updateTenant('t-002', { nickname: 'ขข' });

    expect(sheet.rowsOf('tenants')).toHaveLength(3);
    expect(cell(sheet, 'tenants', 3, 'nickname')).toBe('ขข');
    expect(sheet.writeCount()).toBe(1);
  });

  /**
   * The row number has to come from the read that immediately precedes the
   * write, counting *every* row including ones that are skipped as blank.
   * Counting only the rows that parsed would put this write one row up, on
   * top of a different tenant.
   */
  it('lands on the right sheet row when a skipped row sits above the target', async () => {
    const noteRow = TENANT_HEADER.map((c) => (c === 'note' ? '-- former tenants --' : ''));
    const sheet = tenantsWith([noteRow, tenantRow('t-001', 'สมชาย')]);

    await createSheetsTenantRepository(sheet).updateTenant('t-001', { nickname: 'ชาย' });

    expect(cell(sheet, 'tenants', 3, 'nickname')).toBe('ชาย');
    expect(cell(sheet, 'tenants', 2, 'note')).toBe('-- former tenants --');
  });

  it('refuses to update a record that does not exist', async () => {
    const sheet = tenantsWith([tenantRow('t-001', 'สมชาย')]);
    await expect(
      createSheetsTenantRepository(sheet).updateTenant('t-404', { phone: '1' }),
    ).rejects.toThrow(/No tenant with id "t-404"/);
  });
});

describe('columns the console does not own', () => {
  const ROOM_HEADER = [
    'id', 'room_number', 'kind', 'status', 'rent_rate', 'detail', 'type', 'floor',
    'hasMeter', 'has_tv', 'has_fridge', 'has_aircon', 'archived',
  ];
  const ROOM_101 = [
    '101', '101', 'unit', 'occupied', '2200', '', 'AC', '1',
    'TRUE', 'FALSE', 'FALSE', 'TRUE', 'FALSE',
  ];

  /**
   * `type` is admin bookkeeping the model does not carry. Writing only the
   * columns the console knows about would blank it — turning "update this
   * record" into "replace this record with what the console happens to
   * model", and quietly destroying data on every save.
   */
  it('carries an admin-owned column across an update untouched', async () => {
    const sheet = createInMemorySheets({ rooms: [ROOM_HEADER, ROOM_101] });
    await createSheetsRoomRepository(sheet).updateRoom('101', { rentRate: 2400 });

    expect(cell(sheet, 'rooms', 2, 'type')).toBe('AC');
    expect(cell(sheet, 'rooms', 2, 'rent_rate')).toBe('2400');
  });

  /**
   * Reading resolves cells by header name because admins reorder columns.
   * A write that assumed the contract's own order would put every value one
   * column off the moment someone drags a column — and unlike a bad read,
   * that cannot be undone by fixing the code.
   */
  it("writes by header name when the sheet's columns are in a different order", async () => {
    const shuffled = [...ROOM_HEADER].reverse();
    const shuffledRow = [...ROOM_101].reverse();
    const sheet = createInMemorySheets({ rooms: [shuffled, shuffledRow] });

    await createSheetsRoomRepository(sheet).updateRoom('101', { rentRate: 2400 });

    expect(cell(sheet, 'rooms', 2, 'rent_rate')).toBe('2400');
    expect(cell(sheet, 'rooms', 2, 'type')).toBe('AC');
    expect(cell(sheet, 'rooms', 2, 'room_number')).toBe('101');
  });

  it('renames a room through detail, never through the room number it is keyed by', async () => {
    const sheet = createInMemorySheets({
      rooms: [ROOM_HEADER, ['laundry', 'laundry', 'common', 'occupied', '1800', 'ร้านซักผ้า', '', '1', 'TRUE', 'FALSE', 'FALSE', 'FALSE', 'FALSE']],
    });
    await createSheetsRoomRepository(sheet).updateRoom('laundry', { label: 'ร้านซักรีด' });

    expect(cell(sheet, 'rooms', 2, 'detail')).toBe('ร้านซักรีด');
    expect(cell(sheet, 'rooms', 2, 'room_number')).toBe('laundry');
  });

  /**
   * `null` on an appliance means "not on file". Writing it as the string
   * "null" would read back as a corrupted boolean and fail the entire rooms
   * tab — a save that looks fine and takes the console down on next load.
   */
  it('writes an unsurveyed appliance as a blank cell, not the word null', async () => {
    const sheet = createInMemorySheets({ rooms: [ROOM_HEADER, ROOM_101] });
    const repo = createSheetsRoomRepository(sheet);

    await repo.updateRoom('101', { appliances: { tv: null, fridge: false, aircon: true } });

    expect(cell(sheet, 'rooms', 2, 'has_tv')).toBe('');
    expect(cell(sheet, 'rooms', 2, 'has_fridge')).toBe('FALSE');
    // …and it still reads back, which the string "null" would not.
    expect((await repo.getRoom('101'))?.appliances.tv).toBeNull();
  });

  it('writes a cleared rent rate as blank, never as zero', async () => {
    const sheet = createInMemorySheets({ rooms: [ROOM_HEADER, ROOM_101] });
    await createSheetsRoomRepository(sheet).updateRoom('101', { rentRate: null });

    // 0 would assert the room is free, which is a different and false claim.
    expect(cell(sheet, 'rooms', 2, 'rent_rate')).toBe('');
  });
});

describe('refusing to write what could not be read back', () => {
  /**
   * The write path validates by parsing the row it is about to write. That is
   * what keeps the two sides in agreement without stating every rule twice —
   * and it means a rule that only exists in the reader still guards the
   * writer.
   */
  it('refuses a full national ID and leaves the sheet untouched', async () => {
    const sheet = tenantsWith([tenantRow('t-001', 'สมชาย')]);
    const before = sheet.rowsOf('tenants');

    await expect(
      createSheetsTenantRepository(sheet).updateTenant('t-001', {
        idCardLast4: '1234567890123',
      }),
    ).rejects.toThrow(/Refusing to write an unreadable tenant row.*never the full number/s);

    expect(sheet.rowsOf('tenants')).toEqual(before);
    expect(sheet.writeCount()).toBe(0);
  });

  it('refuses a create whose data would not read back', async () => {
    const sheet = tenantsWith([tenantRow('t-001', 'สมชาย')]);
    await expect(
      createSheetsTenantRepository(sheet).createTenant({ ...DRAFT, fullName: '' }),
    ).rejects.toThrow(/Refusing to write an unreadable tenant row.*missing "full_name"/s);

    expect(sheet.rowsOf('tenants')).toHaveLength(2);
  });
});

describe('archive', () => {
  it('hides the record from the list but keeps it reachable by id', async () => {
    const sheet = tenantsWith([tenantRow('t-001', 'ก'), tenantRow('t-002', 'ข')]);
    const repo = createSheetsTenantRepository(sheet);

    await repo.archiveTenant('t-001');

    expect((await repo.listTenants()).map((t) => t.id)).toEqual(['t-002']);
    // An old link, or a lease pointing at this tenant, must still resolve.
    expect((await repo.getTenant('t-001'))?.archived).toBe(true);
  });

  it('flags the row rather than deleting it — there is no undo for a deleted row', async () => {
    const sheet = tenantsWith([tenantRow('t-001', 'ก')]);
    await createSheetsTenantRepository(sheet).archiveTenant('t-001');

    expect(sheet.rowsOf('tenants')).toHaveLength(2);
    expect(cell(sheet, 'tenants', 2, 'archived')).toBe('TRUE');
  });

  /**
   * An id stays spent after archiving. Reusing it would hand the next tenant
   * the archived one's identity, and every lease and bill pointing at that id
   * would silently attach to the wrong person.
   */
  it("does not hand an archived record's id to the next one created", async () => {
    const sheet = tenantsWith([tenantRow('t-001', 'ก'), tenantRow('t-002', 'ข')]);
    const repo = createSheetsTenantRepository(sheet);

    await repo.archiveTenant('t-002');
    expect((await repo.createTenant(DRAFT)).id).toBe('t-003');
  });
});

describe('leases', () => {
  const LEASE_HEADER = [
    'id', 'room_id', 'tenant_id', 'start_date', 'end_date', 'signed_date',
    'rent_rate', 'deposit', 'advance_rent', 'occupant_count',
    'end_reason', 'previous_lease_id', 'archived',
  ];

  const LEASE_DRAFT = {
    roomId: '105',
    tenantId: 't-002',
    startDate: new Date(2026, 2, 1),
    endDate: null,
    signedDate: new Date(2026, 1, 20),
    rentRate: 2500,
    deposit: 5000,
    advanceRent: 2500,
    occupantCount: 1,
    endReason: null,
    previousLeaseId: null,
  };

  function leaseSheet(): InMemorySheets {
    return createInMemorySheets({
      leases: [
        LEASE_HEADER,
        ['l-001', '101', 't-001', '1 ม.ค. 2568', '', '', '2200', '5000', '2200', '2', '', '', 'FALSE'],
      ],
    });
  }

  /**
   * Dates go out in พ.ศ. through the same formatter the console displays
   * them with, so what is written is what an admin would have typed. An ISO
   * date would be accepted by the sheet and then rejected by every read.
   */
  it('writes Thai Buddhist-era dates, and reads them back unchanged', async () => {
    const sheet = leaseSheet();
    const repo = createSheetsLeaseRepository(sheet);

    const created = await repo.createLease(LEASE_DRAFT);

    expect(cell(sheet, 'leases', 3, 'start_date')).toBe('1 มี.ค. 2569');
    expect(cell(sheet, 'leases', 3, 'signed_date')).toBe('20 ก.พ. 2569');
    expect((await repo.getLease(created.id))?.startDate).toEqual(new Date(2026, 2, 1));
  });

  it('writes an open-ended lease with a blank end date, not a formatted null', async () => {
    const sheet = leaseSheet();
    await createSheetsLeaseRepository(sheet).createLease(LEASE_DRAFT);
    expect(cell(sheet, 'leases', 3, 'end_date')).toBe('');
  });

  it('keeps a transfer linked to the lease it continues', async () => {
    const sheet = leaseSheet();
    const created = await createSheetsLeaseRepository(sheet).createLease({
      ...LEASE_DRAFT,
      previousLeaseId: 'l-001',
    });
    expect(created.previousLeaseId).toBe('l-001');
    expect(cell(sheet, 'leases', 3, 'previous_lease_id')).toBe('l-001');
  });

  // The reader rejects an end reason with no end date; so, therefore, does
  // the writer — without the rule being written down twice.
  it('refuses to end a lease without saying when', async () => {
    const sheet = leaseSheet();
    await expect(
      createSheetsLeaseRepository(sheet).updateLease('l-001', { endReason: 'absconded' }),
    ).rejects.toThrow(/a lease that ended needs an end date/);
  });

  it('records how a tenancy ended when the end date goes with it', async () => {
    const sheet = leaseSheet();
    const ended = await createSheetsLeaseRepository(sheet).updateLease('l-001', {
      endDate: new Date(2026, 5, 30),
      endReason: 'absconded',
    });

    expect(ended.endReason).toBe('absconded');
    expect(cell(sheet, 'leases', 2, 'end_date')).toBe('30 มิ.ย. 2569');
  });
});
