import { describe, expect, it } from 'vitest';
import { createInMemorySheets } from '../memory/in-memory-sheets';
import { createSheetsDocumentTemplateRepository } from './sheets-document-template-repository';
import { createSheetsSettingsRepository } from './sheets-settings-repository';

const SETTINGS_HEADER = ['id', 'value', 'note', 'archived'];
const TEMPLATES_HEADER = ['id', 'doc_type', 'position', 'kind', 'heading', 'body', 'extra', 'archived'];

describe('createSheetsSettingsRepository', () => {
  it('resolves stored values over defaults, and keeps a cleared value blank', async () => {
    const sheet = createInMemorySheets({
      settings: [SETTINGS_HEADER, ['payee_bank', 'ธ.กรุงไทย', '', ''], ['mansion_phone', '', '', '']],
    });
    const values = await createSheetsSettingsRepository(sheet).resolveSettings();
    expect(values.payee_bank).toBe('ธ.กรุงไทย');
    expect(values.mansion_phone).toBe('');
    expect(values.furniture_fee).toBe('1300');
  });

  it('adds a row the first time a key is saved, and edits it in place after', async () => {
    const sheet = createInMemorySheets({ settings: [SETTINGS_HEADER] });
    const repo = createSheetsSettingsRepository(sheet);
    await repo.saveSetting('furniture_fee', ' 1,500 ');
    await repo.saveSetting('furniture_fee', '1400');
    const rows = await repo.listSettings();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'furniture_fee', value: '1400', note: 'ค่าเช่าเฟอร์นิเจอร์ (ต่อเดือน)' });
  });

  it('refuses a key it does not know, and a fee that is not a number', async () => {
    const repo = createSheetsSettingsRepository(createInMemorySheets({ settings: [SETTINGS_HEADER] }));
    await expect(repo.saveSetting('nonsense', 'x')).rejects.toThrow(/not a setting/);
    await expect(repo.saveSetting('late_fee_per_day', 'ห้าสิบ')).rejects.toThrow(/ตัวเลข/);
    await expect(repo.saveSetting('late_fee_per_day', '-5')).rejects.toThrow(/ตัวเลข/);
  });
});

describe('createSheetsDocumentTemplateRepository', () => {
  it('lists one document in position order, archived blocks left out', async () => {
    const sheet = createInMemorySheets({
      document_templates: [
        TEMPLATES_HEADER,
        ['dt-001', 'contract', '20', 'clause', '2. ข้อสอง', 'b', '', ''],
        ['dt-002', 'contract', '10', 'title', '', 'หัว {ห้อง}', '', ''],
        ['dt-003', 'contract', '15', 'paragraph', '', 'ลบแล้ว', '', 'TRUE'],
      ],
    });
    const blocks = await createSheetsDocumentTemplateRepository(sheet).listBlocks('contract');
    expect(blocks.map((b) => b.id)).toEqual(['dt-002', 'dt-001']);
  });

  it('adds, edits and archives a block through the validated write path', async () => {
    const repo = createSheetsDocumentTemplateRepository(
      createInMemorySheets({ document_templates: [TEMPLATES_HEADER] }),
    );
    const added = await repo.addBlock({
      docType: 'contract', position: 10, kind: 'fee_row', heading: 'ตอกตะปู', body: '200 บาท', extra: '',
    });
    expect(added.id).toBe('dt-001');
    await repo.updateBlock(added.id, { body: '300 บาท' });
    expect((await repo.listBlocks('contract'))[0]?.body).toBe('300 บาท');
    await repo.archiveBlock(added.id);
    expect(await repo.listBlocks('contract')).toEqual([]);
  });

  it('refuses a block kind it does not know', async () => {
    const sheet = createInMemorySheets({
      document_templates: [TEMPLATES_HEADER, ['dt-001', 'contract', '10', 'poem', '', 'x', '', '']],
    });
    await expect(createSheetsDocumentTemplateRepository(sheet).listBlocks('contract')).rejects.toThrow(/"kind"/);
  });
});

describe('tenant contract details round-trip', () => {
  it('writes the contract details and reads them back', async () => {
    const { createSeedSheets } = await import('../memory/seed-sheet');
    const { createSheetsTenantRepository } = await import('./sheets-tenant-repository');
    const repo = createSheetsTenantRepository(createSeedSheets());
    const tenant = (await repo.getTenant('t-001'))!;
    await repo.updateTenant('t-001', {
      contractDetails: { ...tenant.contractDetails, birthDate: new Date(2000, 4, 1), workplace: 'บิ๊กซี' },
    });
    expect((await repo.getTenant('t-001'))!.contractDetails).toMatchObject({
      birthDate: new Date(2000, 4, 1),
      workplace: 'บิ๊กซี',
    });
  });
});
