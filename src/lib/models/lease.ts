import type { Archivable } from './archivable';
import { formatThaiDate } from '@/lib/format/thai';

/**
 * A tenancy agreement, per AC-2.2.
 *
 * Foreign keys are ids, never a room number or tenant name — those are
 * display labels and can change (docs/sheet-schema.md rule 4).
 */
export interface Lease extends Archivable {
  id: string;
  roomId: string;
  tenantId: string;
  startDate: Date;
  /** null for an open-ended tenancy — the common case here. */
  endDate: Date | null;
  /**
   * The rent this tenant agreed to, which is **not** necessarily the room's
   * current `rentRate`. A room's rate is what would be charged to a new
   * tenant today; this is what this tenancy is billed at. Billing (KS-21)
   * must read the lease, not the room, or a rate change would silently
   * re-price every sitting tenant.
   */
  rentRate: number;
  /** เงินประกัน — held, and settled on move-out by KS-14 (AC-2.5). */
  deposit: number;
  /** ค่าเช่าล่วงหน้า — rent paid up front at signing. */
  advanceRent: number;
  /**
   * จำนวนผู้พัก. Lives on the lease rather than the room because it changes
   * with the tenancy, and a past bill has to reconstruct the count as it was
   * at the time.
   *
   * This is a **billing input**, not a note: ค่าน้ำ = occupantCount × 100
   * (AC-1.4 / KS-19). A missing count silently under-bills water, which is
   * the exact failure the source spreadsheet warns about — hence it is
   * required rather than defaulted.
   */
  occupantCount: number;
  /**
   * วันที่ทำสัญญา — the contract header date, distinct from `startDate` in
   * ข้อ 3. A tenancy is often signed before it begins. KS-31 needs it to
   * fill the generated document.
   */
  signedDate: Date | null;
  /**
   * How the tenancy ended. `null` while it is still running.
   *
   * `absconded` is `( หนี )` in บัญชีแจ้งคนเข้า-ออก — common enough in the
   * real log to be a normal outcome, not an edge case. Recording the state
   * only; collections workflow stays out of scope (F3 was dropped).
   */
  endReason: LeaseEndReason | null;
  /**
   * The lease this one continues, when a tenant moved rooms (ย้ายห้อง).
   *
   * Without it a single tenancy across two rooms reads as two separate
   * shorter ones, which would corrupt the stay-length analytics in AC-5.2.
   */
  previousLeaseId: string | null;
  /**
   * The move-in and move-out amounts, per AC-2.3 — `ยอดจ่าย` against
   * `จ่ายจริง` on both sides of บัญชีแจ้งคนเข้า-ออก.
   *
   * A move-in is a lease start and a move-out is a lease end, exactly one of
   * each per tenancy, so these live beside the dates they pair with rather
   * than in an event log of their own. AC-2.3's third requirement — lease
   * duration — is already derived by `leaseTermLabel`.
   *
   * **`null` is "not recorded", never zero.** Zero asserts that nothing
   * changed hands, which is a real and different outcome: the register is
   * full of `-` in `จ่ายจริง` against a positive `ยอดจ่าย`, and that is
   * exactly what a tenant absconding looks like.
   *
   * **Sign convention, shared with AC-2.5 / KS-14:** positive means the
   * tenant pays, negative means the tenant is paid. So a move-out `due` of
   * `-1,244` is a deposit refund and `+678` is money still owed after the
   * deposit was consumed — the `+ รับเงินเพิ่มจากเงินประกัน` and
   * `- คืนเงินประกัน` notes in the register's own legend.
   */
  moveInDue: number | null;
  moveInPaid: number | null;
  moveOutDue: number | null;
  moveOutPaid: number | null;
}

export type LeaseEndReason = 'normal' | 'absconded';

const END_REASON_LABELS: Record<LeaseEndReason, string> = {
  normal: 'สิ้นสุดตามปกติ',
  absconded: 'หนี',
};

/** '' while the tenancy is running, so callers can render it unconditionally. */
export function endReasonLabel(reason: LeaseEndReason | null): string {
  return reason ? END_REASON_LABELS[reason] : '';
}

/** ค่าน้ำ is flat per occupant, not metered — see KS-19. */
export const WATER_RATE_PER_OCCUPANT = 100;

/**
 * ค่าน้ำ for a lease: flat by headcount.
 *
 * Deliberately does not fall back to a default when the count is zero — a
 * lease with no occupants recorded is a data error, and quietly billing 0
 * is what the source spreadsheet's own instructions warn against
 * ("หากไม่กรอกจะคำนวนผิดพลาด").
 *
 * ร้านซักผ้า is the exception: it has a real water meter and is billed per
 * unit, so it must not go through here.
 */
export function waterChargeFor(lease: Lease): number {
  return lease.occupantCount * WATER_RATE_PER_OCCUPANT;
}

/** Midnight local, so comparisons are by day and ignore the time of day. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Whether the lease covers a given day. Both bounds are **inclusive**: the
 * last day of a tenancy is still a day the tenant is billed for.
 */
export function isActiveOn(lease: Lease, date: Date): boolean {
  const day = startOfDay(date);
  if (day < startOfDay(lease.startDate)) return false;
  return lease.endDate === null || day <= startOfDay(lease.endDate);
}

/**
 * The lease in force on a given day, or null if the room is vacant then.
 *
 * Overlapping leases should not exist, but a hand-edited sheet can produce
 * them. Rather than picking arbitrarily, the most recently started wins —
 * predictable, and matches "who lives there now".
 */
export function activeLeaseFor(leases: Lease[], date: Date): Lease | null {
  const active = leases.filter((lease) => isActiveOn(lease, date));
  if (active.length === 0) return null;

  return active.reduce((latest, lease) =>
    startOfDay(lease.startDate) > startOfDay(latest.startDate) ? lease : latest,
  );
}

/** '1 ม.ค. 2568 – 31 ธ.ค. 2568', or '… – ไม่กำหนด' when open-ended. */
export function leaseTermLabel(lease: Lease): string {
  const end = lease.endDate ? formatThaiDate(lease.endDate) : 'ไม่กำหนด';
  return `${formatThaiDate(lease.startDate)} – ${end}`;
}
