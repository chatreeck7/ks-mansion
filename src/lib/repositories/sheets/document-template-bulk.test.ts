import { describe, expect, it } from 'vitest';
import { missingDefaultBlocks } from '@/lib/console/template-form';
import { DEFAULT_MONTHLY_REPORT_BLOCKS } from '@/lib/documents/default-monthly-report';
import { createInMemorySheets } from '../memory/in-memory-sheets';
import { createSheetsDocumentTemplateRepository } from './sheets-document-template-repository';

const HEADER = ['id', 'doc_type', 'position', 'kind', 'heading', 'body', 'extra', 'archived'];

describe('addBlocks', () => {
  it('writes every block in one append, with fresh ids after the last', async () => {
    const sheet = createInMemorySheets({
      document_templates: [HEADER, ['dt-037', 'contract', 10, 'title', '', 'สัญญา', '', 'FALSE']],
    });
    const repo = createSheetsDocumentTemplateRepository(sheet);
    const added = await repo.addBlocks(DEFAULT_MONTHLY_REPORT_BLOCKS);

    expect(sheet.writeCount()).toBe(1);
    expect(added.map((b) => b.id).slice(0, 3)).toEqual(['dt-038', 'dt-039', 'dt-040']);
    expect((await repo.listBlocks('monthly_report')).length).toBe(DEFAULT_MONTHLY_REPORT_BLOCKS.length);
  });

  it('writes nothing when one block would not read back', async () => {
    const sheet = createInMemorySheets({ document_templates: [HEADER] });
    const repo = createSheetsDocumentTemplateRepository(sheet);
    const bad = { ...DEFAULT_MONTHLY_REPORT_BLOCKS[1]!, kind: 'nope' as never };
    await expect(repo.addBlocks([DEFAULT_MONTHLY_REPORT_BLOCKS[0]!, bad])).rejects.toThrow();
    expect(sheet.writeCount()).toBe(0);
  });
});

describe('missingDefaultBlocks', () => {
  const asStored = (i: number) => ({ ...DEFAULT_MONTHLY_REPORT_BLOCKS[i]!, id: `dt-${i}`, archived: false });

  it('tops up a copy that stopped half way, in the built-in order', () => {
    const missing = missingDefaultBlocks([asStored(0), asStored(1)], DEFAULT_MONTHLY_REPORT_BLOCKS);
    expect(missing).toEqual(DEFAULT_MONTHLY_REPORT_BLOCKS.slice(2));
  });

  it('leaves a document someone has edited alone', () => {
    const edited = { ...asStored(0), body: 'รายงานของฉัน' };
    expect(missingDefaultBlocks([edited, asStored(1)], DEFAULT_MONTHLY_REPORT_BLOCKS)).toEqual([]);
  });
});
