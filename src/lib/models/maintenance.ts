import type { Archivable } from './archivable';

/**
 * รายการบำรุงรักษา — the family's ตารางตรวจเช็คอุปกรณ์หลัก (F6/F7, kept small).
 *
 * Two lists, as the paper has two axes: the **equipment** down the side
 * (every room's air conditioner, the transformer, the pumps, the filter
 * tank) and the **work** done to each, which the paper files under a year
 * column. A job often has only a year on record — `ล้าง+เติมน้ำยา` in the
 * 2565 column with no day — so the year is the required fact and the exact
 * day is optional.
 */

export const EQUIPMENT_KINDS = ['aircon', 'transformer', 'pump', 'filter', 'other'] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export const EQUIPMENT_KIND_LABELS: Record<EquipmentKind, string> = {
  aircon: 'แอร์',
  transformer: 'หม้อแปลงไฟฟ้า',
  pump: 'ปั้มน้ำ',
  filter: 'ถังกรองน้ำ',
  other: 'อื่นๆ',
};

export interface Equipment extends Archivable {
  id: string;
  /** What the sheet's first column says: `102`, `ห้องเฮีย`, `ปั้มน้ำบาดาล 1`. */
  name: string;
  kind: EquipmentKind;
  /** ยี่ห้อ — `MIDEA`, `FUJIZU`. Blank when not recorded. */
  brand: string;
  /** Room it serves, when it is a room's — links the grid to the rooms tab. */
  roomId: string | null;
  /** Print order. */
  position: number;
  note: string;
}

export type EquipmentDraft = Omit<Equipment, 'id' | 'archived'>;

export interface MaintenanceRecord extends Archivable {
  id: string;
  equipmentId: string;
  /** พ.ศ., as the paper's column heads write it (ปี2569). */
  yearBE: number;
  /** The day, when known; its year always agrees with `yearBE`. */
  doneOn: Date | null;
  /** What was done: `ล้าง+เติมน้ำยา`, `ซ่อมคอมเพรสเซอร์`. */
  work: string;
  /** บาท, when recorded. */
  cost: number | null;
  note: string;
}

export type MaintenanceRecordDraft = Omit<MaintenanceRecord, 'id' | 'archived'>;

/** The jobs the paper records most, offered as suggestions — any text is fine. */
export const COMMON_WORK = ['ล้าง+เติมน้ำยา', 'ล้างแอร์', 'เติมน้ำยา', 'ซ่อมแอร์', 'ซ่อมแผงวงจร', 'ซ่อมคอมเพรสเซอร์', 'ซ่อมตู้ควบคุม', 'เปลี่ยนสารกรอง', 'ตรวจเช็ค'];

/** Equipment in print order, live only. */
export function equipmentInOrder(list: readonly Equipment[]): Equipment[] {
  return list.filter((item) => !item.archived).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'th'));
}
