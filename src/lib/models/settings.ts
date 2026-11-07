import type { Archivable } from './archivable';

/**
 * The building's own facts that go on paper (KS-24, KS-31).
 *
 * The letterhead, the account a bill says to transfer into, the landlord on a
 * contract and the fees the contract quotes. Each used to live in one of three
 * places — a constant in `letterhead.ts`, a Cloudflare environment variable,
 * or the Word file — and none of them was somewhere an admin could change.
 * Here they are rows on a `settings` tab, edited from แม่แบบเอกสาร, so a new
 * bank account or a fee change is a form, not a deploy.
 *
 * **One definition list drives everything**: the stored key, the form label,
 * the type, the default, and the `{placeholder}` a template uses to print it.
 * A setting added here appears in the editor and becomes usable in a
 * contract clause with no second edit.
 */

export type SettingKind = 'text' | 'multiline' | 'money' | 'number';

export interface SettingDefinition {
  /** Stored in the `id` column — stable, never shown. */
  key: SettingKey;
  label: string;
  kind: SettingKind;
  /** What a template writes in braces to print this value. */
  placeholder: string;
  group: SettingGroup;
  defaultValue: string;
  hint?: string;
}

export type SettingGroup = 'building' | 'landlord' | 'payment' | 'fees';

export const SETTING_GROUP_LABELS: Record<SettingGroup, string> = {
  building: 'หัวกระดาษ',
  landlord: 'ผู้ให้เช่า / ผู้รับเงิน',
  payment: 'บัญชีรับโอน',
  fees: 'ค่าใช้จ่ายและข้อกำหนดในสัญญา',
};

export const SETTING_KEYS = [
  'mansion_name',
  'mansion_address',
  'mansion_phone',
  'landlord_name',
  'landlord_address',
  'receiver_name',
  'payee_bank',
  'payee_account_name',
  'payee_account_number',
  'furniture_fee',
  'standard_deposit',
  'electricity_rate',
  'water_per_occupant',
  'late_fee_per_day',
  'cleaning_fee',
  'lockout_fee',
  'extra_guest_fee_per_day',
  'prorate_per_day',
  'max_occupants',
  'minimum_stay_months',
  'notice_days',
  'rent_due_day',
  'terminate_after_day',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  { key: 'mansion_name', label: 'ชื่อหอพัก', kind: 'text', placeholder: 'ชื่อหอ', group: 'building', defaultValue: 'KS MANSION' },
  {
    key: 'mansion_address',
    label: 'ที่อยู่หอพัก',
    kind: 'multiline',
    placeholder: 'ที่อยู่หอ',
    group: 'building',
    defaultValue: '167 ถ.สุขสวัสดิ์ 1 ตำบลพระบาท\nอ.เมือง จ.ลำปาง 52100',
    hint: 'แต่ละบรรทัดพิมพ์เป็นหนึ่งบรรทัดบนหัวกระดาษ',
  },
  { key: 'mansion_phone', label: 'เบอร์โทรหอพัก', kind: 'text', placeholder: 'เบอร์หอ', group: 'building', defaultValue: '' },
  { key: 'landlord_name', label: 'ชื่อผู้ให้เช่า', kind: 'text', placeholder: 'ผู้ให้เช่า', group: 'landlord', defaultValue: '' },
  { key: 'landlord_address', label: 'ที่อยู่ผู้ให้เช่า', kind: 'text', placeholder: 'ที่อยู่ผู้ให้เช่า', group: 'landlord', defaultValue: '' },
  {
    key: 'receiver_name',
    label: 'ชื่อผู้รับเงิน',
    kind: 'text',
    placeholder: 'ผู้รับเงิน',
    group: 'landlord',
    defaultValue: '',
    hint: 'พิมพ์ใต้เส้นลงชื่อผู้รับเงินในใบแจ้งและใบเสร็จ เว้นว่างไว้ถ้าจะเขียนมือ',
  },
  { key: 'payee_bank', label: 'ธนาคาร', kind: 'text', placeholder: 'ธนาคาร', group: 'payment', defaultValue: '' },
  { key: 'payee_account_name', label: 'ชื่อบัญชี', kind: 'text', placeholder: 'ชื่อบัญชี', group: 'payment', defaultValue: '' },
  { key: 'payee_account_number', label: 'เลขบัญชี', kind: 'text', placeholder: 'เลขบัญชี', group: 'payment', defaultValue: '' },
  {
    key: 'furniture_fee',
    label: 'ค่าเช่าเฟอร์นิเจอร์ (ต่อเดือน)',
    kind: 'money',
    placeholder: 'ค่าเฟอร์นิเจอร์',
    group: 'fees',
    defaultValue: '1300',
    hint: 'ค่าเช่าในสัญญาเช่ารวมยอดนี้อยู่แล้ว สัญญาจะแยกพิมพ์เป็นค่าห้อง + ค่าเฟอร์นิเจอร์',
  },
  { key: 'standard_deposit', label: 'เงินประกันมาตรฐาน', kind: 'money', placeholder: 'เงินประกันมาตรฐาน', group: 'fees', defaultValue: '2000' },
  { key: 'electricity_rate', label: 'ค่าไฟ (บาท/หน่วย)', kind: 'number', placeholder: 'ค่าไฟต่อหน่วย', group: 'fees', defaultValue: '7' },
  { key: 'water_per_occupant', label: 'ค่าน้ำเหมาจ่าย (บาท/คน)', kind: 'money', placeholder: 'ค่าน้ำต่อคน', group: 'fees', defaultValue: '100' },
  { key: 'late_fee_per_day', label: 'ค่าปรับชำระช้า (บาท/วัน)', kind: 'money', placeholder: 'ค่าปรับต่อวัน', group: 'fees', defaultValue: '50' },
  { key: 'cleaning_fee', label: 'ค่าทำความสะอาดห้องเมื่อย้ายออก', kind: 'money', placeholder: 'ค่าทำความสะอาด', group: 'fees', defaultValue: '300' },
  { key: 'lockout_fee', label: 'ค่าเปิดห้อง (ลืมกุญแจ)', kind: 'money', placeholder: 'ค่าเปิดห้อง', group: 'fees', defaultValue: '50' },
  { key: 'extra_guest_fee_per_day', label: 'ค่าผู้พักเพิ่ม (บาท/คน/วัน)', kind: 'money', placeholder: 'ค่าผู้พักเพิ่ม', group: 'fees', defaultValue: '100' },
  {
    key: 'prorate_per_day',
    label: 'ค่าเช่าเศษเดือน (บาท/วัน) ค่าเริ่มต้น',
    kind: 'money',
    placeholder: 'เศษเดือนต่อวัน',
    group: 'fees',
    defaultValue: '100',
    hint: 'เติมให้ในฟอร์มสัญญาเมื่อเลือก "คิดรายวัน" — แต่ละสัญญาแก้ได้ตามที่ตกลง',
  },
  { key: 'max_occupants', label: 'ผู้พักสูงสุดต่อห้อง', kind: 'number', placeholder: 'ผู้พักสูงสุด', group: 'fees', defaultValue: '2' },
  { key: 'minimum_stay_months', label: 'ต้องพักอย่างน้อย (เดือน)', kind: 'number', placeholder: 'พักขั้นต่ำ', group: 'fees', defaultValue: '3' },
  { key: 'notice_days', label: 'แจ้งย้ายออกล่วงหน้า (วัน)', kind: 'number', placeholder: 'แจ้งล่วงหน้า', group: 'fees', defaultValue: '30' },
  { key: 'rent_due_day', label: 'ชำระค่าห้องไม่เกินวันที่', kind: 'number', placeholder: 'ชำระภายในวันที่', group: 'fees', defaultValue: '5' },
  { key: 'terminate_after_day', label: 'บอกเลิกสัญญาได้ถ้ายังไม่ชำระภายในวันที่', kind: 'number', placeholder: 'เลิกสัญญาวันที่', group: 'fees', defaultValue: '15' },
];

/** A stored row. `key` is the row's id. */
export interface Setting extends Archivable {
  key: string;
  value: string;
  note: string;
}

/** Every setting resolved to a value: the stored one, else the default. */
export type SettingValues = Record<SettingKey, string>;

export function definitionFor(key: string): SettingDefinition | undefined {
  return SETTING_DEFINITIONS.find((definition) => definition.key === key);
}

/**
 * Stored rows over defaults. A blank stored value **stays blank** rather
 * than falling back: an admin who cleared the phone number meant no phone
 * line, and resurrecting a default would print one they removed.
 */
export function resolveSettings(stored: readonly Setting[]): SettingValues {
  const values = Object.fromEntries(
    SETTING_DEFINITIONS.map((definition) => [definition.key, definition.defaultValue]),
  ) as SettingValues;
  for (const row of stored) {
    if (row.archived) continue;
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
      values[row.key as SettingKey] = row.value;
    }
  }
  return values;
}

/** A money/number setting as a number, or null when blank or not a number. */
export function settingNumber(values: SettingValues, key: SettingKey): number | null {
  const raw = values[key].replace(/,/g, '').trim();
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** The multi-line address as its printed lines, blanks dropped. */
export function settingLines(values: SettingValues, key: SettingKey): string[] {
  return values[key]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Why a value cannot be saved, or null. Only the numeric kinds are checked:
 * text is the admin's to write, and a blank is always allowed.
 */
export function settingProblem(definition: SettingDefinition, value: string): string | null {
  if (definition.kind !== 'money' && definition.kind !== 'number') return null;
  const raw = value.replace(/,/g, '').trim();
  if (raw === '') return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return `${definition.label} ต้องเป็นตัวเลขไม่ติดลบ`;
  return null;
}
