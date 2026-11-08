import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TemplateBlockDraft } from '@/lib/models/document-template';
import { createGoogleSheetsClient } from './google-sheets-client';
import { createSheetsDocumentTemplateRepository } from './sheets-document-template-repository';

/**
 * Puts the family's own รายงานประจำเดือน into แม่แบบเอกสาร, replacing
 * whatever monthly-report blocks are there (they are archived, not deleted).
 *
 *   KS_MANSION_DB_SPREADSHEET_ID=<the live id> \
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
 *   KS_REPORT_FILE=/path/to/monthly-report.json \   # TemplateBlockDraft[]
 *   KS_REPORT_APPLY=dry-run \                        # or `yes`
 *   npx vitest run src/lib/repositories/sheets/monthly-report.import.test.ts
 *
 * The wording names land, vehicles and debtors, so it lives in a file kept
 * out of the repository and only ever reaches the sheet.
 */
const spreadsheetId = process.env.KS_MANSION_DB_SPREADSHEET_ID?.trim() ?? '';
const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ?? '';
const file = process.env.KS_REPORT_FILE?.trim() ?? '';
const mode = process.env.KS_REPORT_APPLY?.trim() ?? '';
const enabled = (mode === 'yes' || mode === 'dry-run') && spreadsheetId !== '' && credentialsJson !== '' && file !== '';

describe.skipIf(!enabled)('import: monthly report wording', () => {
  it(
    'archives the current report blocks and writes the file’s in one append',
    async () => {
      const dry = mode === 'dry-run';
      const log = (line: string) => console.log(`[report${dry ? ' dry-run' : ''}] ${line}`);
      const blocks = JSON.parse(readFileSync(file, 'utf8')) as TemplateBlockDraft[];
      expect(blocks.every((b) => b.docType === 'monthly_report')).toBe(true);

      const repo = createSheetsDocumentTemplateRepository(createGoogleSheetsClient({ credentialsJson, spreadsheetId }));
      const current = await repo.listBlocks('monthly_report');
      log(`archive ${current.length} block(s): ${current.map((b) => b.id).join(', ') || '—'}`);
      log(`write ${blocks.length} block(s)`);
      if (dry) return;

      for (const block of current) await repo.archiveBlock(block.id);
      await repo.addBlocks(blocks);
      const after = await repo.listBlocks('monthly_report');
      expect(after.length).toBe(blocks.length);
      log(`done: ${after[0]?.id} … ${after.at(-1)?.id}`);
    },
    5 * 60 * 1000,
  );
});
