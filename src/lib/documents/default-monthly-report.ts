import type { TemplateBlockDraft } from '@/lib/models/document-template';

/**
 * รายงานประจำเดือน as the family writes it (ต.ค. 2569), with the parts that
 * are about people or property left as headings to fill in: the console
 * keeps names, deeds and plates in the sheet, never in the repository.
 *
 * ข้อ 1 and ข้อ 2 are `auto` blocks — the console writes them from the
 * month's readings, bills and maintenance log. Everything else is text that
 * stays as it was until someone edits it, so next month starts from this
 * month's wording ("ยกจากเดือนก่อน").
 */

type Block = Omit<TemplateBlockDraft, 'docType' | 'position'>;

const section = (heading: string, body = ''): Block => ({ kind: 'section', heading, body, extra: '' });
const table = (heading: string, rows: string[]): Block => ({ kind: 'table', heading, body: rows.join('\n'), extra: '' });
const auto = (heading: string, key: string): Block => ({ kind: 'auto', heading, body: key, extra: '' });

const BLOCKS: Block[] = [
  { kind: 'title', heading: '', body: 'รายงานประจำเดือน {เดือน} {ปี}', extra: '' },
  auto('1. งานหอพัก', 'dorm_work'),
  auto('2. งานซ่อมอุปกรณ์ หอ/อาคาร/ยานพาหนะ', 'repairs'),
  section('3. งานที่ดิน', '- (ชื่อที่ดิน)\n    * (สถานะล่าสุด)'),
  section('4. งานประจำ', '4.1 งานจ่ายค่าใช้จ่ายต่างๆ'),
  table('', [
    'งานจ่ายค่าใช้จ่ายต่างๆ | จ่ายวันที่',
    'ค่าขยะหอพัก | -',
    'ค่าตู้แดงหอพัก | -',
    'ค่าประกันสังคม | ',
    'ค่าน้ำประปาหอพัก | หักผ่านบัญชี',
    'ค่า INTERNET หอพัก | หักผ่านบัตรเครดิต',
    'ค่าโทรศัพท์หอพัก | หักผ่านบัญชี',
    'ค่าไฟหอพัก | หักผ่านบัญชี',
  ]),
  section('', '4.2 งานตรวจสอบ\n4.2.1 หอพัก'),
  table('', [
    'รายการ | ตรวจสอบ | รายการ | ตรวจสอบ | รายการ | ตรวจสอบ',
    'กล้องวงจรปิด | ปกติ | ถังดับเพลิง | ปกติ | หม้อแปลงไฟฟ้า | ปกติ',
    'ห้องเก็บแท๊งค์น้ำบน | ปกติ | รางระบายน้ำ | ปกติ | เครื่อง PRINT | ปกติ',
    'แท๊งค์น้ำล่าง | ปกติ | คอมพิวเตอร์ | ปกติ | เครื่องออกกำลังกาย | ปกติ',
    'ถังกรอง | ปกติ | ประตูคีย์การ์ด | ปกติ | ไฟฉุกเฉิน | ปกติ',
    'ปั้มน้ำบาดาล 1 / ตู้ฯ | ปกติ | อินเตอร์เน็ต | ปกติ | ไฟทางเดิน | ปกติ',
    'ปั้มน้ำบาดาล 2 / ตู้ฯ | ปกติ | UPS | ปกติ | บริเวณรอบๆ หอ | ปกติ',
    'ปั้มน้ำดี / ตู้ฯ | ปกติ | ตู้สาขา | ปกติ |  | ',
  ]),
  section('', '4.2.2 ที่ดิน'),
  table('', ['รายการ | ตรวจสอบ', '(ชื่อที่ดิน) | ปกติ']),
  section('5. คิวต่อภาษีรถยนต์/รถจักรยานยนต์/เทศบาล'),
  table('', ['รายการ | วันครบกำหนดภาษี/พรบ.', '(รถ / ทะเบียน) | ']),
  section('6. แผนงานที่ค้างอยู่', '- '),
  section('7. รายการอุปกรณ์/อะไหล่ หอพัก'),
  table('', ['อุปกรณ์ | จำนวน | อุปกรณ์ | จำนวน', 'ก็อกผนัง | | หลอดไฟสั้น LED | ']),
  section('8. ลูกหนี้'),
  table('', ['ลูกหนี้ | สถานะล่าสุด | สืบทรัพย์ที่เจอ | วันพิพากษา | ตรวจเงิน Early | หมายเหตุ']),
];

export const DEFAULT_MONTHLY_REPORT_BLOCKS: TemplateBlockDraft[] = BLOCKS.map((block, i) => ({
  ...block,
  docType: 'monthly_report',
  position: (i + 1) * 10,
}));
