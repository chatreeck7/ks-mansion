/**
 * Who the building is on a printed document, and where a tenant sends money
 * (KS-24).
 *
 * Two halves, configured differently on purpose.
 *
 * **The letterhead is a constant.** The name and address are transcribed from
 * the ใบแจ้งค่าห้องพัก actually in use in `รายการค่าไฟและค่าห้อง`, and they
 * are the building's identity rather than a setting — a mansion does not move
 * without somebody rewriting more than a config value. Worth knowing: this
 * address **differs from the one in the lease contract template**, and the
 * bill's version is the one in active use. KS-30 and KS-31 take their header
 * from here rather than re-transcribing it.
 *
 * **The payee is configuration.** The lease contract names SCB and every
 * actual bill names ธ.กรุงไทย, which is how KS-24's card came to be titled
 * wrongly. The owner's decision was to follow the bill and make it
 * changeable — so bank, account name and account number are read from the
 * environment and never compiled in. NFR-1.1 requires the bill to *show*
 * payment instructions; it names no bank.
 */

export interface Letterhead {
  name: string;
  /** Printed one per line, in order. */
  addressLines: string[];
  /** Null until `MANSION_PHONE` is set — see `phoneFrom`. */
  phone: string | null;
}

export const MANSION_NAME = 'KS MANSION';

export const MANSION_ADDRESS_LINES = [
  '167 ถ.สุขสวัสดิ์ 1 ตำบลพระบาท',
  'อ.เมือง จ.ลำปาง 52100',
] as const;

/**
 * The contact number the bill's header carries.
 *
 * Configuration rather than a constant only because the number is not in any
 * file this repository can see — the card records that the header has one,
 * not what it is. Absent, the document simply omits the line: a wrong phone
 * number on a bill is worse than no phone number.
 */
function phoneFrom(env: Record<string, unknown> | undefined): string | null {
  const phone = String(env?.MANSION_PHONE ?? '').trim();
  return phone === '' ? null : phone;
}

export function letterheadFrom(env?: Record<string, unknown>): Letterhead {
  return {
    name: MANSION_NAME,
    addressLines: [...MANSION_ADDRESS_LINES],
    phone: phoneFrom(env),
  };
}

/** Where a tenant transfers the money. */
export interface Payee {
  bank: string;
  accountName: string;
  accountNumber: string;
}

/** The three env names, so a missing-config message can list them. */
export const PAYEE_KEYS = ['PAYEE_BANK', 'PAYEE_ACCOUNT_NAME', 'PAYEE_ACCOUNT_NUMBER'] as const;

/**
 * The transfer details, or the names of what is missing.
 *
 * **All three or nothing.** A bill showing a bank with no account number is
 * not a partially-useful bill, it is a bill that cannot be paid from — and it
 * would be handed to a tenant looking complete. So a partial configuration
 * reports as missing and the document says so where the instructions would
 * have gone, rather than printing a gap.
 *
 * Deliberately shaped like `describeDatastore`'s `missingConfig`: the fix for
 * an absent value is a deployment change, and naming the variable is what
 * makes that actionable from a printed page.
 */
export type PayeeConfig =
  | { configured: true; payee: Payee }
  | { configured: false; missing: string[] };

export function payeeFrom(env?: Record<string, unknown>): PayeeConfig {
  const bank = String(env?.PAYEE_BANK ?? '').trim();
  const accountName = String(env?.PAYEE_ACCOUNT_NAME ?? '').trim();
  const accountNumber = String(env?.PAYEE_ACCOUNT_NUMBER ?? '').trim();

  const missing = [
    bank === '' ? 'PAYEE_BANK' : null,
    accountName === '' ? 'PAYEE_ACCOUNT_NAME' : null,
    accountNumber === '' ? 'PAYEE_ACCOUNT_NUMBER' : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) return { configured: false, missing };
  return { configured: true, payee: { bank, accountName, accountNumber } };
}
