import { settingLines, type SettingValues } from '@/lib/models/settings';
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
  /** Printed under the ผู้รับเงิน line; null leaves it for a pen. */
  receiverName?: string | null;
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

/**
 * The letterhead, from แม่แบบเอกสาร's settings when given (KS-31), falling
 * back to the constants and `MANSION_PHONE` that predate them — so a page
 * that has not loaded settings, or a sheet without the tab yet, still prints.
 */
export function letterheadFrom(env?: Record<string, unknown>, settings?: SettingValues): Letterhead {
  const lines = settings ? settingLines(settings, 'mansion_address') : [];
  return {
    name: settings?.mansion_name.trim() || MANSION_NAME,
    addressLines: lines.length > 0 ? lines : [...MANSION_ADDRESS_LINES],
    phone: settings?.mansion_phone.trim() || phoneFrom(env),
    receiverName: settings?.receiver_name.trim() || null,
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

export function payeeFrom(env?: Record<string, unknown>, settings?: SettingValues): PayeeConfig {
  // แม่แบบเอกสาร first (KS-31); the Cloudflare variables remain a fallback
  // so nothing that already prints stops printing when this ships.
  const bank = settings?.payee_bank.trim() || String(env?.PAYEE_BANK ?? '').trim();
  const accountName = settings?.payee_account_name.trim() || String(env?.PAYEE_ACCOUNT_NAME ?? '').trim();
  const accountNumber =
    settings?.payee_account_number.trim() || String(env?.PAYEE_ACCOUNT_NUMBER ?? '').trim();

  const missing = [
    bank === '' ? 'PAYEE_BANK' : null,
    accountName === '' ? 'PAYEE_ACCOUNT_NAME' : null,
    accountNumber === '' ? 'PAYEE_ACCOUNT_NUMBER' : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) return { configured: false, missing };
  return { configured: true, payee: { bank, accountName, accountNumber } };
}
