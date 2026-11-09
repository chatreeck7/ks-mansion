import { ARCHIVED_COLUMN } from '@/lib/models/archivable';
import {
  blocksFor,
  TEMPLATE_BLOCK_KINDS,
  TEMPLATE_DOC_TYPES,
  type TemplateBlock,
  type TemplateBlockDraft,
} from '@/lib/models/document-template';
import type { DocumentTemplateRepository } from '../document-template-repository';
import { createSheetsCrud, type EntitySpec } from './sheets-crud';
import type { SheetsClient } from './sheets-client';
import {
  cellValue,
  enumCell,
  nullableBooleanCell,
  numberCell,
  requireCell,
  type Tab,
  type TabContract,
  type TabDescriptor,
} from './tab-reader';
import type { RowValues } from './tab-writer';

const TAB_NAME = 'document_templates';

const CONTRACT: TabContract = {
  columns: ['id', 'doc_type', 'position', 'kind', 'heading', 'body', 'extra', ARCHIVED_COLUMN],
  identity: ['id', 'doc_type', 'position', 'kind'],
};

function parseBlock(tab: Tab, row: string[], rowNumber: number): TemplateBlock {
  return {
    id: requireCell(tab, row, rowNumber, 'id'),
    docType: enumCell(tab, row, rowNumber, 'doc_type', TEMPLATE_DOC_TYPES),
    position: numberCell(tab, row, rowNumber, 'position'),
    kind: enumCell(tab, row, rowNumber, 'kind', TEMPLATE_BLOCK_KINDS),
    heading: cellValue(tab, row, 'heading'),
    body: cellValue(tab, row, 'body'),
    extra: cellValue(tab, row, 'extra'),
    archived: nullableBooleanCell(tab, row, rowNumber, ARCHIVED_COLUMN) ?? false,
  };
}

function toRowValues(fields: Partial<TemplateBlockDraft>): RowValues {
  const values: RowValues = {};
  if (fields.docType !== undefined) values['doc_type'] = fields.docType;
  if (fields.position !== undefined) values['position'] = fields.position;
  if (fields.kind !== undefined) values['kind'] = fields.kind;
  if (fields.heading !== undefined) values['heading'] = fields.heading;
  if (fields.body !== undefined) values['body'] = fields.body;
  if (fields.extra !== undefined) values['extra'] = fields.extra;
  return values;
}

export const DOCUMENT_TEMPLATES_TAB: TabDescriptor = { tabName: TAB_NAME, contract: CONTRACT };

const SPEC: EntitySpec<TemplateBlock, TemplateBlockDraft> = {
  tabName: TAB_NAME,
  contract: CONTRACT,
  label: 'document template block',
  parse: parseBlock,
  toRowValues,
  idPrefix: 'dt-',
};

export function createSheetsDocumentTemplateRepository(
  client: SheetsClient,
): DocumentTemplateRepository {
  const crud = createSheetsCrud(client, SPEC);
  return {
    async listBlocks(docType) {
      return blocksFor(await crud.list(), docType);
    },
    addBlock: crud.create,
    addBlocks: crud.createMany,
    updateBlock: crud.update,
    archiveBlock: crud.archive,
  };
}
