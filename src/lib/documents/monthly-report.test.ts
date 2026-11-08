import { describe, expect, it } from 'vitest';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import type { TemplateBlock } from '@/lib/models/document-template';
import { resolveSettings } from '@/lib/models/settings';
import { makeBill, makeMeterReading, makePayment, makeRoom } from '@/lib/test-support/fixtures';
import { monthlyReportFor } from './monthly-report';
import { segmentsToText } from './template';

const october = cycleIssuedIn(2026, 9);
const block = (overrides: Partial<TemplateBlock>): TemplateBlock => ({
  id: 'dt-1', docType: 'monthly_report', position: 10, kind: 'section', heading: '', body: '', extra: '', archived: false, ...overrides,
});
const base = {
  cycle: october,
  settings: resolveSettings([]),
  rooms: [makeRoom({ id: '101' }), makeRoom({ id: '102', label: '102', status: 'available' })],
  leases: [],
  readings: [
    makeMeterReading({ id: 'm-1', readDate: new Date(2026, 9, 26) }),
    makeMeterReading({ id: 'm-2', roomId: '102', readDate: new Date(2026, 9, 26) }),
    makeMeterReading({ id: 'm-3', roomId: '103', readDate: new Date(2026, 9, 27) }),
  ],
  bills: [
    makeBill({ id: 'b-1', cycle: '2026-10', issueDate: new Date(2026, 9, 28) }),
    makeBill({ id: 'b-2', roomId: '103', cycle: '2026-10', issueDate: new Date(2026, 9, 28) }),
  ],
  payments: [makePayment({ id: 'p-1', billId: 'b-1', amount: 2636 })],
  equipment: [{ id: 'eq-1', name: '102', kind: 'aircon' as const, brand: '', roomId: '102', position: 10, note: '', archived: false }],
  records: [
    { id: 'mt-1', equipmentId: 'eq-1', yearBE: 2569, doneOn: new Date(2026, 9, 3), work: 'ล้างแอร์', cost: 500, note: '', archived: false },
  ],
  today: new Date(2026, 10, 8),
};

describe('monthlyReportFor', () => {
  it('fills the month placeholders and writes ข้อ 1 from the round, bills and payments', () => {
    const report = monthlyReportFor({
      ...base,
      blocks: [
        block({ kind: 'title', body: 'รายงานประจำเดือน {เดือน} {ปี}' }),
        block({ id: 'dt-2', position: 20, kind: 'auto', body: 'dorm_work' }),
        block({ id: 'dt-3', position: 30, kind: 'auto', body: 'repairs' }),
      ],
    });
    expect(report.usingDefaultWording).toBe(false);
    expect(segmentsToText(report.blocks[0]!.lines[0]!)).toBe('รายงานประจำเดือน ตุลาคม 2569');
    expect(report.blocks[1]!.auto).toEqual([
      '1.1 งานเก็บเงินค่าเช่า ตาม FILE แนบ สรุปรายการค่าไฟ - ค่าห้อง',
      '* 26/10/69 จดเลขมิเตอร์ไฟฟ้า, ทำบิลค่าห้อง',
      '* 28/10/69 วางบิลค่าห้อง 2 ห้อง รวม 5,272 บาท',
      '* รับเงินแล้ว 2,636 บาท (ครบ 1/2 ห้อง) · ค้าง 2,636 บาท — ณ 8 พ.ย. 2569',
      '* ห้องเข้า 0 ห้อง · ห้องออก 0 ห้อง · ห้องว่าง 2 ห้อง (ตามบัญชีคนเข้า-ออก)',
    ]);
    expect(report.blocks[2]!.auto).toEqual(['* 3/10/69 102: ล้างแอร์ (500 บาท)']);
  });

  it('splits a table block into a header and rows', () => {
    const report = monthlyReportFor({ ...base, blocks: [block({ kind: 'table', body: 'รายการ | ตรวจสอบ\nกล้องวงจรปิด | ปกติ' })] });
    expect(report.blocks[0]!.rows.map((row) => row.map(segmentsToText))).toEqual([
      ['รายการ', 'ตรวจสอบ'],
      ['กล้องวงจรปิด', 'ปกติ'],
    ]);
  });

  it('falls back to the built-in wording when the sheet has none', () => {
    const report = monthlyReportFor({ ...base, blocks: [] });
    expect(report.usingDefaultWording).toBe(true);
    expect(report.blocks.some((b) => b.kind === 'auto')).toBe(true);
  });
});
