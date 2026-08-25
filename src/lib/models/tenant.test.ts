import { describe, expect, it } from 'vitest';
import { displayName, maskIdCard, type Tenant } from './tenant';

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-101',
    fullName: 'สมชาย ใจดี',
    nickname: 'ชาย',
    idCardLast4: '1234',
    address: '99 หมู่ 4 ต.ในเมือง อ.เมือง',
    phone: '081-234-5678',
    ...overrides,
  };
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
