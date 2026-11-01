import { describe, expect, it } from 'vitest';
import { resolveSettings } from '@/lib/models/settings';
import type { TemplateBlock } from '@/lib/models/document-template';
import { blockChangesFromForm, newBlockFromForm, settingChangesFromForm } from './template-form';

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

const block = (id: string, position: number, body: string): TemplateBlock => ({
  id, docType: 'contract', position, kind: 'clause', heading: 'ข้อ', body, extra: '', archived: false,
});

describe('settingChangesFromForm', () => {
  it('returns only the settings whose value changed', () => {
    const current = resolveSettings([]);
    const changes = settingChangesFromForm(
      formOf({ 'setting.furniture_fee': '1300', 'setting.payee_bank': ' ธ.กรุงไทย ', 'setting.mansion_address': current.mansion_address.replace('\n', '\r\n') }),
      current,
    );
    expect(changes).toEqual([{ key: 'payee_bank', value: 'ธ.กรุงไทย' }]);
  });
});

describe('blockChangesFromForm', () => {
  const blocks = [block('dt-001', 10, 'เดิม'), block('dt-002', 20, 'สอง')];

  it('reports edited text and moved positions, and leaves untouched blocks out', () => {
    expect(
      blockChangesFromForm(
        formOf({
          'block.dt-001.body': 'ใหม่\r\nบรรทัดสอง',
          'block.dt-001.heading': 'ข้อ',
          'block.dt-001.position': '10',
          'block.dt-002.body': 'สอง',
          'block.dt-002.position': '5',
        }),
        blocks,
      ),
    ).toEqual([
      { id: 'dt-001', changes: { body: 'ใหม่\nบรรทัดสอง' }, archive: false },
      { id: 'dt-002', changes: { position: 5 }, archive: false },
    ]);
  });

  it('marks a ticked block for archiving', () => {
    expect(blockChangesFromForm(formOf({ 'block.dt-002.archive': 'on' }), blocks)).toEqual([
      { id: 'dt-002', changes: {}, archive: true },
    ]);
  });
});

describe('newBlockFromForm', () => {
  it('is null when the add form was left empty', () => {
    expect(newBlockFromForm(formOf({ 'new.kind': 'clause' }), [])).toBeNull();
  });

  it('appends after the last block when no position is given', () => {
    expect(
      newBlockFromForm(formOf({ 'new.kind': 'fee_row', 'new.heading': 'ทำกุญแจหาย', 'new.body': '300 บาท' }), [
        block('dt-001', 40, 'x'),
      ]),
    ).toEqual({ docType: 'contract', kind: 'fee_row', heading: 'ทำกุญแจหาย', body: '300 บาท', extra: '', position: 50 });
  });
});
