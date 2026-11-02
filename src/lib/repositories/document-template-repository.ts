import type {
  TemplateBlock,
  TemplateBlockDraft,
  TemplateDocType,
} from '@/lib/models/document-template';

/**
 * A document's editable wording (KS-31) — see
 * `src/lib/models/document-template.ts`. Current state: editing a clause
 * changes the next contract printed. A contract already signed is the paper
 * in the tenant's hands, not something this regenerates.
 */
export interface DocumentTemplateRepository {
  /** Live blocks of one document, in print order. */
  listBlocks(docType: TemplateDocType): Promise<TemplateBlock[]>;
  addBlock(draft: TemplateBlockDraft): Promise<TemplateBlock>;
  updateBlock(id: string, changes: Partial<TemplateBlockDraft>): Promise<TemplateBlock>;
  /** Soft delete (rule 7): the row stays, the block stops printing. */
  archiveBlock(id: string): Promise<TemplateBlock>;
}
