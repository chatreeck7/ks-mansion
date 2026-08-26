import { describe, expect, it } from 'vitest';
import { makeTenant } from '@/lib/test-support/fixtures';
import {
  displayName,
  EMPTY_ADDRESS,
  formatAddress,
  formatGrade,
  maskIdCard,
  type Tenant,
} from './tenant';

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return makeTenant({ fullName: 'สมชาย ใจดี', ...overrides });
}

describe('displayName', () => {
  it('shows the nickname alongside the full name, which is how staff refer to people', () => {
    expect(displayName(tenant())).toBe('สมชาย ใจดี (ชาย)');
  });

  it('falls back to the full name when there is no nickname', () => {
    expect(displayName(tenant({ nickname: '' }))).toBe('สมชาย ใจดี');
  });

  it('does not render an empty bracket for a whitespace-only nickname', () => {
    expect(displayName(tenant({ nickname: '   ' }))).toBe('สมชาย ใจดี');
  });
});

describe('maskIdCard', () => {
  it('renders the stored last four in a recognisable masked shape', () => {
    // Thai national IDs are 13 digits; the mask stands in for the first nine.
    expect(maskIdCard('1234')).toBe('X-XXXX-XXXXX-XX-1234');
  });

  it('renders an em dash when nothing is on record', () => {
    // Matches the console's existing convention for absent values.
    expect(maskIdCard('')).toBe('—');
  });

  it('renders an em dash rather than a partial mask for a malformed value', () => {
    // Guards the case where someone pastes a full ID into the last-4 column:
    // showing 'X-XXXX-XXXXX-XX-1234567890123' would be worse than showing
    // nothing, and silently truncating would imply data we did not store.
    for (const bad of ['12', '12345', 'abcd', '1234567890123']) {
      expect(maskIdCard(bad), bad).toBe('—');
    }
  });
});

describe('formatAddress', () => {
  it('joins the parts with the prefixes the lease contract uses', () => {
    expect(
      formatAddress({
        houseNo: '99/1',
        road: 'มิตรภาพ',
        subdistrict: 'ในเมือง',
        district: 'เมือง',
        province: 'ขอนแก่น',
        postcode: '40000',
      }),
    ).toBe('99/1 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000');
  });

  // A sparse address is the normal case, not an error — plenty of tenants
  // give a house number and a province and nothing else. Rendering the
  // missing parts as bare prefixes ('ถ. ต. อ.') would read as corruption.
  it('skips parts that are not recorded rather than printing stray prefixes', () => {
    expect(formatAddress({ ...EMPTY_ADDRESS, houseNo: '2', province: 'ขอนแก่น' })).toBe(
      '2 จ.ขอนแก่น',
    );
  });

  it('renders an em dash when nothing at all is on record', () => {
    expect(formatAddress(EMPTY_ADDRESS)).toBe('—');
  });
});

describe('formatGrade', () => {
  it('shows the grade with the legend the source sheet uses', () => {
    expect(formatGrade('A')).toBe('A (ดีมาก)');
    expect(formatGrade('B')).toBe('B (ดี)');
    expect(formatGrade('C')).toBe('C (พอใช้ได้)');
  });

  // Not yet assessed is a real state — a tenant who moved in this week has no
  // ใบผลประเมิน yet — and must not render as a failing grade.
  it('renders an em dash when the tenant has not been assessed', () => {
    expect(formatGrade(null)).toBe('—');
    expect(formatGrade(tenant({ evaluationGrade: null }).evaluationGrade)).toBe('—');
  });
});
