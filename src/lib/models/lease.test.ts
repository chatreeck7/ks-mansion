import { describe, expect, it } from 'vitest';
import { makeLease } from '@/lib/test-support/fixtures';
import {
  isActiveOn,
  activeLeaseFor,
  endReasonLabel,
  leaseTermLabel,
  settleDeposit,
  settlementLabel,
  waterChargeFor,
  WATER_RATE_PER_OCCUPANT,
  type Lease,
} from './lease';

function lease(overrides: Partial<Lease> = {}): Lease {
  return makeLease(overrides);
}

const JUNE = new Date(2025, 5, 15);

describe('isActiveOn', () => {
  it('is active on the start date itself', () => {
    expect(isActiveOn(lease({ startDate: JUNE }), JUNE)).toBe(true);
  });

  it('is not active before it starts', () => {
    expect(isActiveOn(lease({ startDate: new Date(2025, 6, 1) }), JUNE)).toBe(false);
  });

  it('stays active with no end date — an open-ended tenancy', () => {
    expect(isActiveOn(lease({ endDate: null }), JUNE)).toBe(true);
  });

  it('is active on the end date, and not the day after', () => {
    // The last day of a tenancy is still a day of tenancy — the tenant is
    // billed for it, so the boundary is inclusive.
    const endDate = new Date(2025, 5, 15);
    expect(isActiveOn(lease({ endDate }), endDate)).toBe(true);
    expect(isActiveOn(lease({ endDate }), new Date(2025, 5, 16))).toBe(false);
  });

  it('ignores the time of day on either side', () => {
    // A lease read at 23:00 must not appear to have ended already.
    const endDate = new Date(2025, 5, 15);
    expect(isActiveOn(lease({ endDate }), new Date(2025, 5, 15, 23, 59))).toBe(true);
    expect(isActiveOn(lease({ startDate: endDate }), new Date(2025, 5, 15, 0, 1))).toBe(true);
  });
});

describe('activeLeaseFor', () => {
  const past = lease({ id: 'old', startDate: new Date(2024, 0, 1), endDate: new Date(2024, 11, 31) });
  const current = lease({ id: 'now', startDate: new Date(2025, 0, 1), endDate: null });

  it('picks the lease covering the date', () => {
    expect(activeLeaseFor([past, current], JUNE)?.id).toBe('now');
  });

  it('returns null when nothing covers it — a vacant room', () => {
    expect(activeLeaseFor([past], JUNE)).toBeNull();
  });

  it('returns null for no leases at all', () => {
    expect(activeLeaseFor([], JUNE)).toBeNull();
  });

  it('picks the most recently started when records overlap', () => {
    // Overlaps should not happen, but a hand-edited sheet can produce them.
    // Guessing silently is bad; picking the newest is at least predictable
    // and matches "who lives there now".
    const older = lease({ id: 'older', startDate: new Date(2025, 0, 1) });
    const newer = lease({ id: 'newer', startDate: new Date(2025, 3, 1) });
    expect(activeLeaseFor([older, newer], JUNE)?.id).toBe('newer');
    expect(activeLeaseFor([newer, older], JUNE)?.id).toBe('newer');
  });
});

describe('leaseTermLabel', () => {
  it('shows both dates in Thai when the lease has an end', () => {
    const label = leaseTermLabel(
      lease({ startDate: new Date(2025, 0, 1), endDate: new Date(2025, 11, 31) }),
    );
    expect(label).toBe('1 ม.ค. 2568 – 31 ธ.ค. 2568');
  });

  it('marks an open-ended lease rather than showing a blank end', () => {
    expect(leaseTermLabel(lease({ startDate: new Date(2025, 0, 1), endDate: null }))).toBe(
      '1 ม.ค. 2568 – ไม่กำหนด',
    );
  });
});

describe('waterChargeFor', () => {
  it('charges a flat rate per occupant — ค่าน้ำ is not metered for a home', () => {
    expect(waterChargeFor(lease({ occupantCount: 3 }))).toBe(3 * WATER_RATE_PER_OCCUPANT);
    expect(waterChargeFor(lease({ occupantCount: 1 }))).toBe(100);
  });

  // The source spreadsheet's own instruction is that leaving the headcount
  // out makes the calculation wrong ("หากไม่กรอกจะคำนวนผิดพลาด"). The model
  // cannot stop that on its own — what it can do is refuse to invent a
  // default, so a zero here reads as zero rather than as one occupant.
  it('does not fall back to a default when no occupants are recorded', () => {
    expect(waterChargeFor(lease({ occupantCount: 0 }))).toBe(0);
  });
});

describe('endReasonLabel', () => {
  it('names how the tenancy ended', () => {
    expect(endReasonLabel('normal')).toBe('สิ้นสุดตามปกติ');
    expect(endReasonLabel('absconded')).toBe('หนี');
  });

  it('is empty while the tenancy is still running', () => {
    expect(endReasonLabel(null)).toBe('');
  });
});

describe('previousLeaseId', () => {
  // A tenant moving 102 → 105 is one tenancy, not two. Without the link,
  // length-of-stay analytics (AC-5.2) would count two short stays where the
  // building has one long-standing tenant.
  it('links a transfer back to the lease it continues', () => {
    const first = lease({ id: 'l-002', roomId: '102', endDate: new Date(2026, 1, 28) });
    const transfer = lease({
      id: 'l-004',
      roomId: '105',
      startDate: new Date(2026, 2, 1),
      previousLeaseId: first.id,
    });
    expect(transfer.previousLeaseId).toBe('l-002');
    expect(first.previousLeaseId).toBeNull();
  });
});

/**
 * AC-2.5, and the reason this card sat blocked for two days: getting the sign
 * backwards tells the owner to refund money to people who owe it, and a number
 * with the wrong sign still looks like a number. Owner confirmed 2026-08-27.
 */
describe('settleDeposit', () => {
  it('reports what the tenant still owes when damage exceeds the deposit', () => {
    expect(settleDeposit(5000, 6000)).toEqual({ amount: 1000, outcome: 'owes' });
  });

  it('reports a refund when the deposit more than covers what is owed', () => {
    expect(settleDeposit(5000, 3000)).toEqual({ amount: -2000, outcome: 'refund' });
  });

  it('reports neither when they cancel out exactly', () => {
    expect(settleDeposit(5000, 5000)).toEqual({ amount: 0, outcome: 'settled' });
  });

  /**
   * The ห้อง 310 หนี row: `ยอดจ่าย +1,894` against a blank `จ่ายจริง`. Nobody
   * refunds a tenant who fled, so a positive figure has to mean money owed —
   * which is what pinned the convention.
   */
  it('gives the absconded case a positive amount, never a refund', () => {
    const { amount, outcome } = settleDeposit(3000, 4894);
    expect(amount).toBe(1894);
    expect(outcome).toBe('owes');
  });

  it('treats an undamaged move-out as a full refund of the deposit', () => {
    expect(settleDeposit(5000, 0)).toEqual({ amount: -5000, outcome: 'refund' });
  });
});

describe('settlementLabel', () => {
  it('says which direction the money moves, not just a signed number', () => {
    expect(settlementLabel(1894)).toContain('เก็บเพิ่ม');
    expect(settlementLabel(-1244)).toContain('คืน');
    expect(settlementLabel(0)).toContain('พอดี');
  });

  /** A refund reads as a positive quantity of money going the other way. */
  it('drops the minus sign when describing a refund', () => {
    expect(settlementLabel(-1244)).toBe('คืน 1,244');
    expect(settlementLabel(-1244)).not.toContain('-');
  });
});
