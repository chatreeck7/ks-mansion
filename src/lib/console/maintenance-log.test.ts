import { describe, expect, it } from 'vitest';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import type { Equipment, MaintenanceRecord } from '@/lib/models/maintenance';
import { equipmentFromForm, maintenanceGrid, recordFromForm, recordsInMonth } from './maintenance-log';

const item = (overrides: Partial<Equipment>): Equipment => ({
  id: 'eq-001', name: '102', kind: 'aircon', brand: 'MIDEA', roomId: '102', position: 10, note: '', archived: false, ...overrides,
});
const record = (overrides: Partial<MaintenanceRecord>): MaintenanceRecord => ({
  id: 'mt-001', equipmentId: 'eq-001', yearBE: 2569, doneOn: null, work: 'ล้าง+เติมน้ำยา', cost: null, note: '', archived: false, ...overrides,
});

const equipment = [item({}), item({ id: 'eq-002', name: 'ปั้มน้ำบาดาล 1', kind: 'pump', brand: '', roomId: null, position: 900 })];
const today = new Date(2026, 10, 8);

describe('maintenanceGrid', () => {
  const records = [
    record({ id: 'mt-1', yearBE: 2563, doneOn: new Date(2020, 6, 3), work: 'ซ่อมแอร์' }),
    record({ id: 'mt-2', yearBE: 2564, doneOn: new Date(2021, 10, 15) }),
    record({ id: 'mt-3', yearBE: 2569 }),
    record({ id: 'mt-4', yearBE: 2569, doneOn: new Date(2026, 4, 12), equipmentId: 'eq-002', work: 'ซ่อมตู้ควบคุม' }),
    record({ id: 'mt-5', yearBE: 2555 }),
    record({ id: 'mt-6', yearBE: 2569, work: 'ลบแล้ว', archived: true }),
  ];
  const grid = maintenanceGrid(equipment, records, today);

  it('shows the last seven พ.ศ. years, as the paper does', () => {
    expect(grid.years).toEqual([2563, 2564, 2565, 2566, 2567, 2568, 2569]);
    expect(grid.older).toBe(1);
  });

  it('files each job under its year, with the day when known', () => {
    const [air, pump] = grid.rows;
    expect(air!.cells[0]).toEqual([{ recordId: 'mt-1', work: 'ซ่อมแอร์', day: '3/7' }]);
    expect(air!.cells[1]).toEqual([{ recordId: 'mt-2', work: 'ล้าง+เติมน้ำยา', day: '15/11' }]);
    expect(air!.cells[6]).toEqual([{ recordId: 'mt-3', work: 'ล้าง+เติมน้ำยา', day: null }]);
    expect(pump!.cells[6]![0]!.work).toBe('ซ่อมตู้ควบคุม');
  });

  it('knows each item’s newest job', () => {
    expect(grid.rows[1]!.last?.id).toBe('mt-4');
  });

  it('lists the notebook month’s jobs for the monthly report', () => {
    expect(recordsInMonth(records, cycleIssuedIn(2026, 4)).map((r) => r.id)).toEqual(['mt-4']);
  });
});

describe('recordFromForm', () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  it('takes the year from the day', () => {
    const { draft } = recordFromForm(form({ equipment_id: 'eq-001', work: 'ล้างแอร์', done_on: '2026-11-01', cost: '1,200' }), equipment, today);
    expect(draft).toMatchObject({ yearBE: 2569, doneOn: new Date(2026, 10, 1), cost: 1200 });
  });

  it('accepts a job remembered only by its year', () => {
    const { draft } = recordFromForm(form({ equipment_id: 'eq-001', work: 'ล้างแอร์', year_only: 'on', year: '2566' }), equipment, today);
    expect(draft).toMatchObject({ yearBE: 2566, doneOn: null });
  });

  it('says what is missing', () => {
    const { draft, errors } = recordFromForm(form({ equipment_id: 'nope', done_on: '2027-01-01' }), equipment, today);
    expect(draft).toBeNull();
    expect(errors).toEqual(['เลือกอุปกรณ์ก่อน', 'ใส่งานที่ทำ เช่น ล้าง+เติมน้ำยา', 'วันที่ทำอยู่ในอนาคต']);
  });
});

describe('equipmentFromForm', () => {
  it('appends after the last item', () => {
    const data = new FormData();
    data.set('name', '305');
    data.set('kind', 'aircon');
    expect(equipmentFromForm(data, equipment).draft).toMatchObject({ name: '305', kind: 'aircon', position: 910, roomId: null });
  });
});
