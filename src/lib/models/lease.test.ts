import { describe, expect, it } from 'vitest';
import { isActiveOn, activeLeaseFor, leaseTermLabel, type Lease } from './lease';

function lease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: 'l-001',
    roomId: '101',
    tenantId: 't-001',
    startDate: new Date(2025, 0, 1),
    endDate: null,
    rentRate: 2636,
    deposit: 5000,
    advanceRent: 2636,
    ...overrides,
  };
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
