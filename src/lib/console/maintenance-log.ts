import { dateFromInput } from '@/lib/console/lease-form';
import { toBuddhistYear } from '@/lib/format/thai';
import type { BillingCycle } from '@/lib/models/billing-cycle';
import {
  EQUIPMENT_KINDS,
  equipmentInOrder,
  type Equipment,
  type EquipmentDraft,
  type EquipmentKind,
  type MaintenanceRecord,
  type MaintenanceRecordDraft,
} from '@/lib/models/maintenance';

/**
 * The maintenance page's working parts: the yearly grid that prints, the
 * form that records a job, and the month's jobs for the monthly report.
 */

/** How many year columns the grid shows — the paper has seven (2563–2569). */
export const GRID_YEARS = 7;

export interface GridEntry {
  recordId: string;
  work: string;
  /** `15/11` — the day and month, when recorded. */
  day: string | null;
}

export interface GridRow {
  equipment: Equipment;
  cells: GridEntry[][];
  /** The newest job on record, for "when was this last done". */
  last: MaintenanceRecord | null;
}

export interface MaintenanceGrid {
  /** พ.ศ., oldest first. */
  years: number[];
  rows: GridRow[];
  /** Jobs older than the first column, which the grid does not show. */
  older: number;
}

function newestFirst(a: MaintenanceRecord, b: MaintenanceRecord): number {
  return b.yearBE - a.yearBE || (b.doneOn?.getTime() ?? 0) - (a.doneOn?.getTime() ?? 0);
}

export function maintenanceGrid(
  equipment: readonly Equipment[],
  records: readonly MaintenanceRecord[],
  today: Date,
  years = GRID_YEARS,
): MaintenanceGrid {
  const lastYear = toBuddhistYear(today.getFullYear());
  const columns = Array.from({ length: years }, (_, i) => lastYear - years + 1 + i);
  const live = records.filter((record) => !record.archived);
  const rows = equipmentInOrder(equipment).map((item) => {
    const own = live.filter((record) => record.equipmentId === item.id).sort(newestFirst);
    const cells = columns.map((year) =>
      own
        .filter((record) => record.yearBE === year)
        .reverse()
        .map((record) => ({
          recordId: record.id,
          work: record.work,
          day: record.doneOn ? `${record.doneOn.getDate()}/${record.doneOn.getMonth() + 1}` : null,
        })),
    );
    return { equipment: item, cells, last: own[0] ?? null };
  });
  return { years: columns, rows, older: live.filter((record) => record.yearBE < columns[0]!).length };
}

/** Jobs done in the cycle's calendar month (the notebook page), oldest first. */
export function recordsInMonth(records: readonly MaintenanceRecord[], cycle: BillingCycle): MaintenanceRecord[] {
  const month = cycle.issueDate.getMonth();
  const year = cycle.issueDate.getFullYear();
  return records
    .filter((r) => !r.archived && r.doneOn && r.doneOn.getFullYear() === year && r.doneOn.getMonth() === month)
    .sort((a, b) => a.doneOn!.getTime() - b.doneOn!.getTime());
}

export interface RecordSubmission {
  draft: MaintenanceRecordDraft | null;
  errors: string[];
}

/**
 * One job from the form. Either a day (`done_on`) or — for a job remembered
 * only by its year, as most of the paper's are — a year with `year_only`.
 */
export function recordFromForm(form: FormData, equipment: readonly Equipment[], today: Date): RecordSubmission {
  const errors: string[] = [];
  const text = (name: string) => String(form.get(name) ?? '').trim();
  const equipmentId = text('equipment_id');
  if (!equipment.some((item) => item.id === equipmentId && !item.archived)) errors.push('เลือกอุปกรณ์ก่อน');
  const work = text('work');
  if (!work) errors.push('ใส่งานที่ทำ เช่น ล้าง+เติมน้ำยา');

  let doneOn: Date | null = null;
  let yearBE: number | null = null;
  if (form.get('year_only')) {
    const year = Number(text('year'));
    if (!Number.isInteger(year) || year < 2500 || year > toBuddhistYear(today.getFullYear())) {
      errors.push('ปี พ.ศ. ไม่ถูกต้อง');
    } else {
      yearBE = year;
    }
  } else {
    doneOn = dateFromInput(text('done_on'));
    if (!doneOn) errors.push('เลือกวันที่ทำ หรือติ๊ก "รู้แค่ปี"');
    else if (doneOn.getTime() > today.getTime()) errors.push('วันที่ทำอยู่ในอนาคต');
    else yearBE = toBuddhistYear(doneOn.getFullYear());
  }

  const costRaw = text('cost').replace(/,/g, '');
  const cost = costRaw === '' ? null : Number(costRaw);
  if (cost !== null && !(cost >= 0)) errors.push('ค่าใช้จ่ายต้องเป็นตัวเลข');

  if (errors.length > 0 || yearBE === null) return { draft: null, errors };
  return { draft: { equipmentId, yearBE, doneOn, work, cost, note: text('note') }, errors };
}

/** A new piece of equipment from the form; appended after the last one. */
export function equipmentFromForm(
  form: FormData,
  existing: readonly Equipment[],
): { draft: EquipmentDraft | null; errors: string[] } {
  const name = String(form.get('name') ?? '').trim();
  const kindRaw = String(form.get('kind') ?? '');
  const kind = (EQUIPMENT_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as EquipmentKind) : 'other';
  if (!name) return { draft: null, errors: ['ใส่ชื่ออุปกรณ์ เช่น 305 หรือ ปั้มน้ำดี'] };
  const position = Math.max(0, ...existing.map((item) => item.position)) + 10;
  const roomId = String(form.get('room_id') ?? '').trim() || null;
  return {
    draft: { name, kind, brand: String(form.get('brand') ?? '').trim(), roomId, position, note: '' },
    errors: [],
  };
}
