/**
 * A tenant profile, per AC-2.1: the fields the lease contract records.
 *
 * Guarantor / emergency contact (AC-2.7) and occupation tag (AC-5.3) are
 * deliberately absent — they belong to KS-9 and KS-10.
 */
export interface Tenant {
  /** Stable identifier used in URLs. Never derived from a name. */
  id: string;
  /** As written on the lease contract. */
  fullName: string;
  /** ชื่อเล่น — how staff actually refer to people. May be empty. */
  nickname: string;
  /**
   * The **last four digits only** of the Thai national ID.
   *
   * Deliberately not the full 13 digits: the sheet is opened directly by
   * admins, so anything stored here is effectively visible to everyone with
   * access. Four digits is enough to check a person against their lease
   * contract, which is what this field is actually for, while keeping a
   * national identifier out of a shared spreadsheet.
   */
  idCardLast4: string;
  address: string;
  phone: string;
}

/** 'สมชาย ใจดี (ชาย)' — full name plus nickname, which is how staff refer to people. */
export function displayName(tenant: Tenant): string {
  const nickname = tenant.nickname.trim();
  return nickname ? `${tenant.fullName} (${nickname})` : tenant.fullName;
}

/**
 * Renders the stored last four in the shape of a Thai national ID, so it
 * reads as a partial identifier rather than a mystery number.
 *
 * Anything that is not exactly four digits renders as an em dash. A value of
 * the wrong length means the column holds something other than what this
 * field promises — most likely a full ID pasted in by mistake — and showing
 * a partial mask of it would leak precisely what the last-4 decision exists
 * to avoid.
 */
export function maskIdCard(idCardLast4: string): string {
  return /^\d{4}$/.test(idCardLast4) ? `X-XXXX-XXXXX-XX-${idCardLast4}` : '—';
}
