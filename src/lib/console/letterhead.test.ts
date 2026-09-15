import { describe, expect, it } from 'vitest';
import { letterheadFrom, payeeFrom, PAYEE_KEYS } from './letterhead';

const FULL = {
  PAYEE_BANK: 'ธ.กรุงไทย',
  PAYEE_ACCOUNT_NAME: 'ทดสอบ ทดสอบ',
  PAYEE_ACCOUNT_NUMBER: '123-4-56789-0',
};

describe('letterheadFrom', () => {
  it('carries the address the bills actually use', () => {
    const head = letterheadFrom({});
    expect(head.name).toBe('KS MANSION');
    expect(head.addressLines).toEqual([
      '167 ถ.สุขสวัสดิ์ 1 ตำบลพระบาท',
      'อ.เมือง จ.ลำปาง 52100',
    ]);
  });

  /**
   * The card records that the bill's header carries a phone number but not
   * what it is. Printing a guess on a document a tenant would dial is worse
   * than printing nothing.
   */
  it('omits the phone rather than inventing one', () => {
    expect(letterheadFrom({}).phone).toBeNull();
    expect(letterheadFrom({ MANSION_PHONE: '   ' }).phone).toBeNull();
    expect(letterheadFrom({ MANSION_PHONE: ' 054-123456 ' }).phone).toBe('054-123456');
  });

  it('does not let the caller mutate the shared address', () => {
    const head = letterheadFrom({});
    head.addressLines.push('แก้ไขไม่ได้');
    expect(letterheadFrom({}).addressLines).toHaveLength(2);
  });
});

describe('payeeFrom', () => {
  it('reads the transfer details from configuration, never a compiled-in bank', () => {
    const result = payeeFrom(FULL);
    expect(result).toEqual({
      configured: true,
      payee: {
        bank: 'ธ.กรุงไทย',
        accountName: 'ทดสอบ ทดสอบ',
        accountNumber: '123-4-56789-0',
      },
    });
  });

  it('names what is missing, so an unusable bill says how to fix itself', () => {
    const result = payeeFrom({});
    expect(result).toEqual({ configured: false, missing: [...PAYEE_KEYS] });
  });

  /**
   * All three or nothing. A bank with no account number is not a partly
   * useful bill — it is one that looks complete and cannot be paid from.
   */
  it('treats a partial configuration as missing', () => {
    const result = payeeFrom({ PAYEE_BANK: 'ธ.กรุงไทย' });
    expect(result).toMatchObject({
      configured: false,
      missing: ['PAYEE_ACCOUNT_NAME', 'PAYEE_ACCOUNT_NUMBER'],
    });
  });

  it('counts whitespace as unset, since a blank env var reads as a value', () => {
    expect(payeeFrom({ ...FULL, PAYEE_ACCOUNT_NUMBER: '   ' })).toMatchObject({
      configured: false,
      missing: ['PAYEE_ACCOUNT_NUMBER'],
    });
  });
});
