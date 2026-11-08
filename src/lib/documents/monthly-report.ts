import { recordsInMonth } from '@/lib/console/maintenance-log';
import { shortThaiDate } from '@/lib/console/month-summary';
import { movementPeriodFor, movementRegisterFor } from '@/lib/console/movements';
import { DEFAULT_MONTHLY_REPORT_BLOCKS } from '@/lib/documents/default-monthly-report';
import { renderLines, renderTemplate, type PlaceholderValues, type Segment } from '@/lib/documents/template';
import { formatBaht, formatThaiDate, THAI_MONTHS_FULL, toBuddhistYear } from '@/lib/format/thai';
import { billTotal, type Bill } from '@/lib/models/bill';
import { isReadingDay, type BillingCycle } from '@/lib/models/billing-cycle';
import {
  AUTO_BLOCK_KEYS,
  blocksFor,
  tableRows,
  type AutoBlockKey,
  type TemplateBlock,
  type TemplateBlockKind,
} from '@/lib/models/document-template';
import type { Lease } from '@/lib/models/lease';
import type { Equipment, MaintenanceRecord } from '@/lib/models/maintenance';
import type { MeterReading } from '@/lib/models/meter-reading';
import type { Payment } from '@/lib/models/payment';
import type { Room } from '@/lib/models/room';
import { SETTING_DEFINITIONS, type SettingValues } from '@/lib/models/settings';
import type { PlaceholderInfo } from './contract';

/**
 * รายงานประจำเดือน (owner, 8 พ.ย. 2569): the family's own wording, held as
 * template blocks like the contract, with ข้อ 1 and ข้อ 2 written by the
 * console from what it already knows. The rest is text that carries over
 * month to month until someone changes it.
 */

const REPORT_PLACEHOLDERS: PlaceholderInfo[] = [
  { name: 'เดือน', description: 'ชื่อเดือนของรายงาน เช่น ตุลาคม' },
  { name: 'ปี', description: 'ปี พ.ศ. ของรายงาน' },
  { name: 'วันจดมิเตอร์', description: 'วันที่จดมิเตอร์รอบนี้ เช่น 26/10/69' },
  { name: 'วันวางบิล', description: 'วันที่ออกบิลรอบนี้' },
  { name: 'ครบกำหนด', description: 'วันครบกำหนดชำระของรอบนี้' },
];

export function monthlyReportPlaceholders(): PlaceholderInfo[] {
  return [
    ...REPORT_PLACEHOLDERS,
    ...SETTING_DEFINITIONS.filter((d) => d.kind !== 'money').map((d) => ({
      name: d.placeholder,
      description: `จากค่าตั้งต้น: ${d.label}`,
    })),
  ];
}

export interface MonthlyReportInput {
  blocks: readonly TemplateBlock[];
  cycle: BillingCycle;
  settings: SettingValues;
  rooms: readonly Room[];
  leases: readonly Lease[];
  readings: readonly MeterReading[];
  bills: readonly Bill[];
  payments: readonly Payment[];
  equipment: readonly Equipment[];
  records: readonly MaintenanceRecord[];
  today: Date;
}

export interface ReportBlock {
  id: string;
  kind: TemplateBlockKind;
  heading: Segment[];
  lines: Segment[][];
  /** `table` only: header row first. */
  rows: Segment[][][];
  /** `auto` only: the lines the console wrote. */
  auto: string[];
}

export interface MonthlyReport {
  title: string;
  blocks: ReportBlock[];
  usingDefaultWording: boolean;
}

/** The day most of the round's electricity dials were read. */
function roundDay(cycle: BillingCycle, readings: readonly MeterReading[]): Date | null {
  const counts = new Map<number, { date: Date; n: number }>();
  for (const reading of readings) {
    if (reading.archived || reading.meterType !== 'electricity' || !isReadingDay(cycle, reading.readDate)) continue;
    const d = reading.readDate;
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const seen = counts.get(key) ?? { date: d, n: 0 };
    seen.n += 1;
    counts.set(key, seen);
  }
  let best: { date: Date; n: number } | null = null;
  for (const entry of counts.values()) if (!best || entry.n > best.n) best = entry;
  return best?.date ?? null;
}

export function monthlyReportValues(input: Pick<MonthlyReportInput, 'cycle' | 'settings' | 'readings' | 'bills'>): PlaceholderValues {
  const { cycle, settings } = input;
  const month = cycle.issueDate;
  const read = roundDay(cycle, input.readings);
  const issued = input.bills.find((bill) => !bill.archived && bill.cycle === cycle.id);
  const values: PlaceholderValues = {
    เดือน: THAI_MONTHS_FULL[month.getMonth()],
    ปี: String(toBuddhistYear(month.getFullYear())),
    วันจดมิเตอร์: read ? shortThaiDate(read) : null,
    วันวางบิล: issued ? shortThaiDate(issued.issueDate) : null,
    ครบกำหนด: formatThaiDate(cycle.dueDate),
  };
  for (const definition of SETTING_DEFINITIONS) {
    if (definition.kind !== 'money') values[definition.placeholder] = settings[definition.key];
  }
  return values;
}

function dormWork(input: MonthlyReportInput): string[] {
  const { cycle, bills, payments, today } = input;
  const read = roundDay(cycle, input.readings);
  const cycleBills = bills.filter((bill) => !bill.archived && bill.cycle === cycle.id);
  const lines = ['1.1 งานเก็บเงินค่าเช่า ตาม FILE แนบ สรุปรายการค่าไฟ - ค่าห้อง'];
  lines.push(read ? `* ${shortThaiDate(read)} จดเลขมิเตอร์ไฟฟ้า, ทำบิลค่าห้อง` : '* ยังไม่ได้จดมิเตอร์รอบนี้');
  if (cycleBills.length === 0) {
    lines.push('* ยังไม่ได้ออกบิลรอบนี้');
  } else {
    const total = cycleBills.reduce((sum, bill) => sum + billTotal(bill), 0);
    const ids = new Set(cycleBills.map((bill) => bill.id));
    const paidBy = new Map<string, number>();
    for (const payment of payments) {
      if (payment.archived || !ids.has(payment.billId)) continue;
      paidBy.set(payment.billId, (paidBy.get(payment.billId) ?? 0) + payment.amount);
    }
    const paid = [...paidBy.values()].reduce((a, b) => a + b, 0);
    const owing = cycleBills.reduce((sum, bill) => sum + Math.max(0, billTotal(bill) - (paidBy.get(bill.id) ?? 0)), 0);
    const settled = cycleBills.filter((bill) => (paidBy.get(bill.id) ?? 0) >= billTotal(bill)).length;
    lines.push(`* ${shortThaiDate(cycleBills[0]!.issueDate)} วางบิลค่าห้อง ${cycleBills.length} ห้อง รวม ${formatBaht(total)} บาท`);
    lines.push(
      `* รับเงินแล้ว ${formatBaht(paid)} บาท (ครบ ${settled}/${cycleBills.length} ห้อง) · ค้าง ${formatBaht(owing)} บาท — ณ ${formatThaiDate(today)}`,
    );
  }
  const register = movementRegisterFor(movementPeriodFor(cycle), input.rooms, input.leases, []);
  lines.push(
    `* ห้องเข้า ${register.moveIns.length} ห้อง · ห้องออก ${register.moveOuts.length} ห้อง · ห้องว่าง ${register.vacant.length} ห้อง (ตามบัญชีคนเข้า-ออก)`,
  );
  return lines;
}

function repairs(input: MonthlyReportInput): string[] {
  const names = new Map(input.equipment.map((item) => [item.id, item.name]));
  const jobs = recordsInMonth(input.records, input.cycle);
  if (jobs.length === 0) return ['- ไม่มีงานซ่อม/บำรุงที่บันทึกในเดือนนี้'];
  return jobs.map((job) => {
    const cost = job.cost !== null ? ` (${formatBaht(job.cost)} บาท)` : '';
    const note = job.note ? ` — ${job.note}` : '';
    return `* ${shortThaiDate(job.doneOn!)} ${names.get(job.equipmentId) ?? ''}: ${job.work}${cost}${note}`;
  });
}

export function monthlyReportFor(input: MonthlyReportInput): MonthlyReport {
  const stored = blocksFor(input.blocks, 'monthly_report');
  const usingDefaultWording = stored.length === 0;
  const source: Array<Pick<TemplateBlock, 'kind' | 'heading' | 'body' | 'extra'> & { id: string }> = usingDefaultWording
    ? DEFAULT_MONTHLY_REPORT_BLOCKS.map((block, i) => ({ ...block, id: `default-${i}` }))
    : stored;
  const values = monthlyReportValues(input);

  const blocks = source.map((block): ReportBlock => {
    const key = block.body.trim() as AutoBlockKey;
    return {
      id: block.id,
      kind: block.kind,
      heading: renderTemplate(block.heading, values),
      lines: block.kind === 'table' || block.kind === 'auto' ? [] : renderLines(block.body, values),
      rows: block.kind === 'table' ? tableRows(block.body).map((row) => row.map((cell) => renderTemplate(cell, values))) : [],
      auto:
        block.kind !== 'auto' || !AUTO_BLOCK_KEYS.includes(key)
          ? []
          : key === 'dorm_work'
            ? dormWork(input)
            : repairs(input),
    };
  });

  const month = input.cycle.issueDate;
  return {
    title: `รายงานประจำเดือน ${THAI_MONTHS_FULL[month.getMonth()]} ${toBuddhistYear(month.getFullYear())}`,
    blocks,
    usingDefaultWording,
  };
}
