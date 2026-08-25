/**
 * A tenant profile.
 *
 * The model is **person-centric**, not room-centric, even though the
 * operational ใบผลประเมินผู้เช่า sheet records rooms without names: per-person
 * history and the AC-5.2 stay-length analytics both need a stable person
 * identity. Names do exist operationally — รายการค่าไฟและค่าห้อง carries a
 * room/name/phone sheet.
 *
 * Guarantor / emergency contact (AC-2.7) is still KS-9.
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
  /**
   * Split into the parts the lease contract asks for, rather than one
   * string. `สัญญาเช่าห้องชุด` has six separate blanks, so KS-31 cannot
   * generate a contract from a single line — and splitting one heuristically
   * at generation time would be guesswork on a legal document.
   */
  address: ThaiAddress;
  phone: string;
  /**
   * อาชีพ. Free text per AC-5.3, not a fixed list: real values are varied
   * and often compound ('ราชภัฏ/7-11', 'ซีนิค/นักเรียน').
   */
  occupation: string;
  /** ผลประเมิน — A = ดีมาก, B = ดี, C = พอใช้ได้. Null when not yet assessed. */
  evaluationGrade: EvaluationGrade | null;
  /** Free text; the real sheet carries qualifiers like '(เลี้ยงแมว)'. */
  note: string;
}

export type EvaluationGrade = 'A' | 'B' | 'C';

/** The label shown against each grade in the source sheet's own legend. */
const GRADE_LABELS: Record<EvaluationGrade, string> = {
  A: 'ดีมาก',
  B: 'ดี',
  C: 'พอใช้ได้',
};

export interface ThaiAddress {
  /** บ้านเลขที่ */
  houseNo: string;
  /** ถนน */
  road: string;
  /** ตำบล */
  subdistrict: string;
  /** อำเภอ */
  district: string;
  /** จังหวัด */
  province: string;
  /** รหัสไปรษณีย์ */
  postcode: string;
}

export const EMPTY_ADDRESS: ThaiAddress = {
  houseNo: '',
  road: '',
  subdistrict: '',
  district: '',
  province: '',
  postcode: '',
};

/**
 * One line for display, skipping parts that are not recorded so a sparse
 * address does not render as a row of stray prefixes.
 */
export function formatAddress(address: ThaiAddress): string {
  const parts = [
    address.houseNo,
    address.road && `ถ.${address.road}`,
    address.subdistrict && `ต.${address.subdistrict}`,
    address.district && `อ.${address.district}`,
    address.province && `จ.${address.province}`,
    address.postcode,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' ') : '—';
}

/** 'A (ดีมาก)', or an em dash when no grade is on record. */
export function formatGrade(grade: EvaluationGrade | null): string {
  return grade ? `${grade} (${GRADE_LABELS[grade]})` : '—';
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
