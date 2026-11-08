import type { Archivable } from './archivable';

/**
 * A document's wording, one block per row (KS-31).
 *
 * The lease contract is the family's own text, and it changes — the due day
 * in the old one was wrong (KS-31 notes), the new draft added a furniture fee
 * and a fines table. Holding it as ordered, editable blocks lets an admin fix
 * a clause from แม่แบบเอกสาร without a developer, and lets the console fill
 * the blanks from the tenant and lease instead of by pen.
 *
 * Blocks are **text with `{placeholders}`**, never markup: what an admin can
 * type is what prints, and nothing typed can break the page.
 */

export const TEMPLATE_DOC_TYPES = ['contract', 'monthly_report'] as const;
export type TemplateDocType = (typeof TEMPLATE_DOC_TYPES)[number];

export const TEMPLATE_DOC_TYPE_LABELS: Record<TemplateDocType, string> = {
  contract: 'สัญญาเช่า',
  monthly_report: 'รายงานประจำเดือน',
};

export const TEMPLATE_BLOCK_KINDS = [
  'title',
  'paragraph',
  'clause',
  'fee_row',
  'item_row',
  'closing',
  'section',
  'table',
  'auto',
] as const;
export type TemplateBlockKind = (typeof TEMPLATE_BLOCK_KINDS)[number];

export const TEMPLATE_BLOCK_KIND_LABELS: Record<TemplateBlockKind, string> = {
  title: 'หัวเรื่อง',
  paragraph: 'ย่อหน้า',
  clause: 'ข้อสัญญา',
  fee_row: 'แถวตารางค่าปรับ/ค่าซ่อม',
  item_row: 'รายการเครื่องใช้ในห้อง',
  closing: 'ย่อหน้าท้าย',
  section: 'หัวข้อ + ข้อความ',
  table: 'ตาราง',
  auto: 'ส่วนที่ระบบเติมให้',
};

/** Which kinds each document offers in the editor. */
export const BLOCK_KINDS_FOR: Record<TemplateDocType, readonly TemplateBlockKind[]> = {
  contract: ['title', 'paragraph', 'clause', 'fee_row', 'item_row', 'closing'],
  monthly_report: ['title', 'section', 'table', 'paragraph', 'auto'],
};

/**
 * What an `auto` block fills in — its `body` holds one of these keys. The
 * monthly report's ข้อ 1 and ข้อ 2 are facts the console already has, so
 * they are written by it rather than retyped each month.
 */
export const AUTO_BLOCK_KEYS = ['dorm_work', 'repairs'] as const;
export type AutoBlockKey = (typeof AUTO_BLOCK_KEYS)[number];

export const AUTO_BLOCK_LABELS: Record<AutoBlockKey, string> = {
  dorm_work: 'งานหอพักเดือนนี้: วันจดมิเตอร์ วันวางบิล ยอดเงิน ห้องเข้า-ออก',
  repairs: 'งานซ่อม/บำรุงเดือนนี้ จากหน้าบำรุงรักษา',
};

/**
 * A table block's cells: one line per row, cells split on `|`, the first
 * line is the header. Typed as plain text so it can be edited in the sheet
 * as easily as on the page.
 */
export function tableRows(body: string): string[][] {
  return body
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => line.split('|').map((cell) => cell.trim()));
}

export interface TemplateBlock extends Archivable {
  id: string;
  docType: TemplateDocType;
  /** Print order. Gaps are fine — 10, 20, 30 leaves room to insert. */
  position: number;
  kind: TemplateBlockKind;
  /**
   * A clause's heading (`1. การพักอาศัย`), a fee row's item, a furniture
   * line's name. Blank for a plain paragraph.
   */
  heading: string;
  /** The text. Line breaks are kept: each line of a clause prints as a line. */
  body: string;
  /** A fee row's second amount (ค่าซ่อมแซม); unused by other kinds. */
  extra: string;
}

export type TemplateBlockDraft = Omit<TemplateBlock, 'id' | 'archived'>;

/** Blocks of one document, in print order, live ones only. */
export function blocksFor(blocks: readonly TemplateBlock[], docType: TemplateDocType): TemplateBlock[] {
  return blocks
    .filter((block) => block.docType === docType && !block.archived)
    .sort((a, b) => a.position - b.position);
}
