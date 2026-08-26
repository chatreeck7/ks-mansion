import { describe, expect, it } from 'vitest';
import { tenantDraftFromForm } from './tenant-form';

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

describe('tenantDraftFromForm', () => {
  it('maps every field the form posts, address parts included', () => {
    const draft = tenantDraftFromForm(
      formOf({
        fullName: 'สมชาย ใจดี',
        nickname: 'ชาย',
        idCardLast4: '1234',
        phone: '0812345678',
        occupation: 'ช่างไฟ',
        evaluationGrade: 'B',
        note: '(เลี้ยงแมว)',
        'address.houseNo': '99/1',
        'address.road': 'มิตรภาพ',
        'address.subdistrict': 'ในเมือง',
        'address.district': 'เมือง',
        'address.province': 'นครราชสีมา',
        'address.postcode': '30000',
      }),
    );

    expect(draft).toEqual({
      fullName: 'สมชาย ใจดี',
      nickname: 'ชาย',
      idCardLast4: '1234',
      phone: '0812345678',
      occupation: 'ช่างไฟ',
      evaluationGrade: 'B',
      note: '(เลี้ยงแมว)',
      address: {
        houseNo: '99/1',
        road: 'มิตรภาพ',
        subdistrict: 'ในเมือง',
        district: 'เมือง',
        province: 'นครราชสีมา',
        postcode: '30000',
      },
    });
  });

  /**
   * "" is not a grade. Storing it as one would put the empty string in a
   * column the reader expects to hold A, B, C or nothing.
   */
  it('reads a blank grade as "not yet assessed", not as a grade', () => {
    expect(tenantDraftFromForm(formOf({ evaluationGrade: '' })).evaluationGrade).toBeNull();
    expect(tenantDraftFromForm(formOf({})).evaluationGrade).toBeNull();
    expect(tenantDraftFromForm(formOf({ evaluationGrade: 'A' })).evaluationGrade).toBe('A');
  });

  it('trims, so a stray space does not become part of a name or an id', () => {
    const draft = tenantDraftFromForm(
      formOf({ fullName: '  สมชาย  ', idCardLast4: ' 1234 ', 'address.postcode': ' 30000 ' }),
    );

    expect(draft.fullName).toBe('สมชาย');
    expect(draft.idCardLast4).toBe('1234');
    expect(draft.address.postcode).toBe('30000');
  });

  it('fills absent fields with blanks rather than undefined', () => {
    const draft = tenantDraftFromForm(formOf({ fullName: 'สมชาย' }));

    expect(draft.nickname).toBe('');
    expect(draft.address.houseNo).toBe('');
  });

  /**
   * Validation belongs to the store, which parses the row with the read
   * path's own parser and refuses anything unreadable. Rejecting here would
   * be a second copy of that rule, and the copies drift.
   */
  it('shapes without validating — a full national id is passed on, not caught here', () => {
    expect(tenantDraftFromForm(formOf({ idCardLast4: '1234567890123' })).idCardLast4).toBe(
      '1234567890123',
    );
  });
});
