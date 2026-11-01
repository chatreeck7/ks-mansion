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

export const TEMPLATE_DOC_TYPES = ['contract'] as const;
export type TemplateDocType = (typeof TEMPLATE_DOC_TYPES)[number];

export const TEMPLATE_BLOCK_KINDS = ['title', 'paragraph', 'clause', 'fee_row', 'item_row', 'closing'] as const;
export type TemplateBlockKind = (typeof TEMPLATE_BLOCK_KINDS)[number];

export const TEMPLATE_BLOCK_KIND_LABELS: Record<TemplateBlockKind, string> = {
  title: 'หัวเรื่อง',
  paragraph: 'ย่อหน้า',
  clause: 'ข้อสัญญา',
  fee_row: 'แถวตารางค่าปรับ/ค่าซ่อม',
  item_row: 'รายการเครื่องใช้ในห้อง',
  closing: 'ย่อหน้าท้าย',
};

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
