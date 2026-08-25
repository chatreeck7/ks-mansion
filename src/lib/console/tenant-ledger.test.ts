import { describe, expect, it } from 'vitest';
import type { Tenant } from '@/lib/models/tenant';
import { toTenantGroups } from './tenant-ledger';

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-001',
    fullName: 'สมชาย ใจดี',
    nickname: 'ชาย',
    idCardLast4: '1234',
    address: 'ที่อยู่',
    phone: '081-234-5678',
    ...overrides,
  };
}

describe('toTenantGroups', () => {
  it('returns no groups at all for an empty list, rather than an empty heading', () => {
    expect(toTenantGroups([])).toEqual([]);
  });

  it('puts everyone in one group, sorted by full name', () => {
    const groups = toTenantGroups([
      tenant({ id: 'b', fullName: 'สมหญิง ข' }),
      tenant({ id: 'a', fullName: 'กมล ก' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the caller’s array while sorting', () => {
    const input = [tenant({ id: 'b', fullName: 'ข' }), tenant({ id: 'a', fullName: 'ก' })];
    toTenantGroups(input);
    expect(input.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('shows the nickname alongside the name', () => {
    const [group] = toTenantGroups([tenant()]);
    expect(group?.rows[0]?.cells.name).toEqual({ kind: 'text', value: 'สมชาย ใจดี (ชาย)' });
  });

  it('renders an em dash for a missing phone, not a blank cell', () => {
    const [group] = toTenantGroups([tenant({ phone: '' })]);
    expect(group?.rows[0]?.cells.phone).toEqual({ kind: 'text', value: '—' });
  });

  it('links each row to that tenant’s detail page', () => {
    const [group] = toTenantGroups([tenant({ id: 't-042' })]);
    expect(group?.rows[0]?.href).toContain('console/tenants/t-042');
  });

  it('does not expose the ID card in the list view', () => {
    // The list is the most-shoulder-surfed screen in the console; even the
    // masked form belongs on the detail page, not here.
    const [group] = toTenantGroups([tenant()]);
    expect(JSON.stringify(group)).not.toContain('1234');
  });
});
