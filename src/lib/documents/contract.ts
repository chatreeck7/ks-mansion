import { formatBaht, formatReading, formatThaiDate, formatThaiMonthName, toBuddhistYear } from '@/lib/format/thai';
import { blocksFor, type TemplateBlock, type TemplateBlockKind } from '@/lib/models/document-template';
import type { Lease } from '@/lib/models/lease';
import type { MeterReading } from '@/lib/models/meter-reading';
import type { Room } from '@/lib/models/room';
import {
  SETTING_DEFINITIONS,
  settingNumber,
  settingLines,
  type SettingValues,
} from '@/lib/models/settings';
import { ageOn, formatAddress, type Tenant } from '@/lib/models/tenant';
import { DEFAULT_CONTRACT_BLOCKS } from './default-contract';
import { renderLines, renderTemplate, type PlaceholderValues, type Segment } from './template';

/**
 * A lease contract, filled from the records (KS-31).
 *
 * Pure: the page hands in the lease, its tenant and room, the settings, the
 * contract's blocks and the meter readings, and gets back what to print plus
 * anything that should be fixed before it is printed. Nothing is invented —
 * a value that is not on file prints as a dotted line to fill by hand.
 */

export interface PlaceholderInfo {
  name: string;
  description: string;
}

/**
 * The placeholders a contract may use that come from the tenancy itself.
 * Settings add their own (one per definition), so the full list is
 * `contractPlaceholders()`.
 */
const LEASE_PLACEHOLDERS: PlaceholderInfo[] = [
  { name: 'ห้อง', description: 'เลขห้อง' },
  { name: 'ชั้น', description: 'ชั้นของห้อง' },
  { name: 'วันที่ทำสัญญา', description: 'วันที่ (ตัวเลข) ของวันทำสัญญา — ถ้าไม่ได้บันทึกใช้วันเริ่มเช่า' },
  { name: 'เดือนที่ทำสัญญา', description: 'ชื่อเดือนของวันทำสัญญา' },
  { name: 'ปีที่ทำสัญญา', description: 'ปี พ.ศ. ของวันทำสัญญา' },
  { name: 'วันเริ่มเช่า', description: 'วันเริ่มสัญญาเช่า เช่น 1 พ.ย. 2569' },
  { name: 'วันเริ่มคิดค่าเช่า', description: 'วันเริ่มคิดค่าเช่าตามที่ตกลง (ถ้าไม่ได้กำหนด = วันเริ่มเช่า)' },
  { name: 'เศษเดือนต่อวันของสัญญา', description: 'ค่าเช่าเศษเดือนต่อวันที่ตกลงในสัญญานี้ (ว่าง = ไม่คิด)' },
  { name: 'ผู้เช่า', description: 'ชื่อ-นามสกุลผู้เช่า' },
  { name: 'ผู้เช่าคนที่2', description: 'ชื่อผู้เช่าคนที่ 2 (ถ้ามี)' },
  { name: 'อายุ', description: 'อายุผู้เช่า ณ วันทำสัญญา (จากวันเกิด)' },
  { name: 'ตำแหน่ง', description: 'ตำแหน่งงานของผู้เช่า' },
  { name: 'ที่ทำงาน', description: 'สถานที่ทำงานของผู้เช่า' },
  { name: 'ที่อยู่ผู้เช่า', description: 'ที่อยู่ตามบัตรประชาชน' },
  { name: 'เบอร์ผู้เช่า', description: 'เบอร์โทรผู้เช่า' },
  { name: 'ประเภทรถ', description: 'รถจักรยานยนต์/รถยนต์ (ถ้าว่างพิมพ์ทั้งสองคำ)' },
  { name: 'ยี่ห้อรถ', description: 'ยี่ห้อรถ' },
  { name: 'รุ่นรถ', description: 'รุ่นรถ' },
  { name: 'สีรถ', description: 'สีรถ' },
  { name: 'ทะเบียนรถ', description: 'เลขทะเบียนรถ' },
  { name: 'ค่าเช่ารวม', description: 'ค่าเช่าต่อเดือนตามสัญญา (รวมค่าเฟอร์นิเจอร์)' },
  { name: 'ค่าห้อง', description: 'ค่าเช่ารวม − ค่าเฟอร์นิเจอร์' },
  { name: 'เงินประกัน', description: 'เงินประกันตามสัญญา (ถ้าไม่ได้บันทึกใช้เงินประกันมาตรฐาน)' },
  { name: 'ค่าเช่าล่วงหน้า', description: 'ค่าเช่าล่วงหน้าตามสัญญา (ถ้าไม่ได้บันทึกใช้ค่าเช่ารวม)' },
  { name: 'ค่าจอง', description: 'ค่ามัดจำ/จองห้อง' },
  { name: 'คงจ่าย', description: 'ค่าเช่าล่วงหน้า + เงินประกัน − ค่าจอง' },
  { name: 'จำนวนผู้พัก', description: 'จำนวนผู้พักตามสัญญา' },
  { name: 'มิเตอร์ไฟเริ่มต้น', description: 'เลขมิเตอร์ไฟล่าสุดที่จดก่อนหรือในวันเริ่มเช่า' },
];

export function contractPlaceholders(): PlaceholderInfo[] {
  return [
    ...LEASE_PLACEHOLDERS,
    ...SETTING_DEFINITIONS.map((definition) => ({
      name: definition.placeholder,
      description: `จากค่าตั้งต้น: ${definition.label}`,
    })),
  ];
}

export interface ContractInput {
  lease: Lease;
  tenant: Tenant;
  room: Room;
  settings: SettingValues;
  /** Every block on the templates tab; this picks the contract's. */
  blocks: readonly TemplateBlock[];
  readings: readonly MeterReading[];
}

export interface RenderedBlock {
  id: string;
  kind: TemplateBlockKind;
  heading: Segment[];
  lines: Segment[][];
  extra: Segment[];
}

export interface Contract {
  blocks: RenderedBlock[];
  tenantName: string;
  coTenantName: string | null;
  landlordName: string | null;
  /** Shown above the document, never printed: things to fix first. */
  warnings: string[];
  /** True when the templates tab had no contract and the built-in wording was used. */
  usingDefaultWording: boolean;
}

const money = (amount: number | null): string | null => (amount === null ? null : formatBaht(amount));

/** The electricity dial when the tenancy began: the newest reading on or before it. */
export function startingMeter(readings: readonly MeterReading[], lease: Lease): number | null {
  const start = new Date(lease.startDate.getFullYear(), lease.startDate.getMonth(), lease.startDate.getDate()).getTime();
  let best: MeterReading | null = null;
  for (const reading of readings) {
    if (reading.archived || reading.roomId !== lease.roomId || reading.meterType !== 'electricity') continue;
    if (reading.readDate.getTime() > start) continue;
    if (!best || reading.readDate.getTime() >= best.readDate.getTime()) best = reading;
  }
  return best ? best.currentReading : null;
}

/** Splits the contract's monthly rent into ค่าห้อง + ค่าเฟอร์นิเจอร์. */
export function rentSplit(
  rentRate: number,
  furnitureFee: number | null,
): { room: number | null; furniture: number | null } {
  if (furnitureFee === null || furnitureFee <= 0) return { room: rentRate, furniture: null };
  if (rentRate < furnitureFee) return { room: null, furniture: furnitureFee };
  return { room: rentRate - furnitureFee, furniture: furnitureFee };
}

export function contractValues(input: Omit<ContractInput, 'blocks'>): PlaceholderValues {
  const { lease, tenant, room, settings, readings } = input;
  const details = tenant.contractDetails;
  const contractDate = lease.signedDate ?? lease.startDate;
  const furnitureFee = settingNumber(settings, 'furniture_fee');
  const split = rentSplit(lease.rentRate, furnitureFee);
  const deposit = lease.deposit > 0 ? lease.deposit : settingNumber(settings, 'standard_deposit');
  const advance = lease.advanceRent > 0 ? lease.advanceRent : lease.rentRate;
  const age = ageOn(details.birthDate, contractDate);
  const address = formatAddress(tenant.address);
  const meter = startingMeter(readings, lease);

  const values: PlaceholderValues = {};
  for (const definition of SETTING_DEFINITIONS) {
    const value = settings[definition.key];
    values[definition.placeholder] =
      definition.kind === 'multiline'
        ? settingLines(settings, definition.key).join(' ')
        : definition.kind === 'money'
          ? money(settingNumber(settings, definition.key))
          : value;
  }

  Object.assign(values, {
    ห้อง: room.label,
    ชั้น: String(room.floor),
    วันที่ทำสัญญา: String(contractDate.getDate()),
    เดือนที่ทำสัญญา: formatThaiMonthName(contractDate),
    ปีที่ทำสัญญา: String(toBuddhistYear(contractDate.getFullYear())),
    วันเริ่มเช่า: formatThaiDate(lease.startDate),
    วันเริ่มคิดค่าเช่า: formatThaiDate(lease.billingStartDate ?? lease.startDate),
    เศษเดือนต่อวันของสัญญา: lease.proratePerDay ? money(lease.proratePerDay) : null,
    ผู้เช่า: tenant.fullName,
    ผู้เช่าคนที่2: lease.coTenantName,
    อายุ: age === null ? null : String(age),
    ตำแหน่ง: details.position,
    ที่ทำงาน: details.workplace,
    ที่อยู่ผู้เช่า: address === '—' ? null : address,
    เบอร์ผู้เช่า: tenant.phone,
    ประเภทรถ: details.vehicleType || 'รถจักรยานยนต์/รถยนต์',
    ยี่ห้อรถ: details.vehicleBrand,
    รุ่นรถ: details.vehicleModel,
    สีรถ: details.vehicleColor,
    ทะเบียนรถ: details.vehiclePlate,
    ค่าเช่ารวม: money(lease.rentRate),
    ค่าห้อง: money(split.room),
    // The fee as the contract quotes it, so a clause reads the same whether
    // it names the setting or the split.
    ค่าเฟอร์นิเจอร์: money(split.furniture ?? furnitureFee),
    เงินประกัน: money(deposit),
    ค่าเช่าล่วงหน้า: money(advance),
    ค่าจอง: money(lease.bookingFee),
    คงจ่าย: money(advance + (deposit ?? 0) - (lease.bookingFee ?? 0)),
    จำนวนผู้พัก: String(lease.occupantCount),
    มิเตอร์ไฟเริ่มต้น: meter === null ? null : formatReading(meter),
  });
  return values;
}

/** Placeholder names whose value is missing and that a contract would print blank. */
const WORTH_FILLING: Record<string, string> = {
  ผู้ให้เช่า: 'ชื่อผู้ให้เช่า (ตั้งในแม่แบบเอกสาร)',
  ที่อยู่ผู้เช่า: 'ที่อยู่ผู้เช่า',
  อายุ: 'วันเกิดผู้เช่า',
  เบอร์ผู้เช่า: 'เบอร์โทรผู้เช่า',
  มิเตอร์ไฟเริ่มต้น: 'เลขมิเตอร์ไฟก่อนวันเริ่มเช่า',
  ค่าห้อง: 'ค่าเช่าน้อยกว่าค่าเฟอร์นิเจอร์ — แยกค่าห้องไม่ได้',
};

export function contractFor(input: ContractInput): Contract {
  const values = contractValues(input);
  const stored = blocksFor(input.blocks, 'contract');
  const usingDefaultWording = stored.length === 0;
  const source: TemplateBlock[] = usingDefaultWording
    ? DEFAULT_CONTRACT_BLOCKS.map((draft, index) => ({ ...draft, id: `default-${index}`, archived: false }))
    : stored;

  const blocks = source.map((block) => ({
    id: block.id,
    kind: block.kind,
    heading: renderTemplate(block.heading, values),
    lines: renderLines(block.body, values),
    extra: renderTemplate(block.extra, values),
  }));

  const used = new Set<string>();
  const unknown = new Set<string>();
  for (const block of blocks) {
    for (const segment of [...block.heading, ...block.lines.flat(), ...block.extra]) {
      if (segment.kind === 'blank') used.add(segment.name);
      if (segment.kind === 'unknown') unknown.add(segment.text);
    }
  }

  const warnings: string[] = [];
  if (/\(รอชื่อ\)/.test(input.tenant.fullName)) {
    warnings.push('ชื่อผู้เช่ายังเป็นชื่อชั่วคราว "(รอชื่อ)" — แก้ที่โปรไฟล์ผู้เช่าก่อนพิมพ์');
  }
  for (const [name, label] of Object.entries(WORTH_FILLING)) {
    if (used.has(name)) warnings.push(`ยังไม่มี${label} — จะพิมพ์เป็นช่องว่างให้เขียนมือ`);
  }
  if (input.lease.signedDate === null) {
    warnings.push('ยังไม่ได้บันทึกวันทำสัญญา — ใช้วันเริ่มเช่าแทน');
  }
  for (const text of unknown) {
    warnings.push(`แม่แบบมีช่อง ${text} ที่ระบบไม่รู้จัก — พิมพ์ตามที่เขียนไว้`);
  }

  return {
    blocks,
    tenantName: input.tenant.fullName,
    coTenantName: input.lease.coTenantName,
    landlordName: input.settings.landlord_name.trim() || null,
    warnings,
    usingDefaultWording,
  };
}
