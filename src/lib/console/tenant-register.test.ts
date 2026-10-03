import { describe, expect, it } from 'vitest';
import { makeLease, makeRoom, makeTenant } from '@/lib/test-support/fixtures';
import { tenantRegister } from './tenant-register';

const TODAY = new Date(2025, 3, 3);
const rooms = [
  makeRoom({ id: '102', label: '102' }),
  makeRoom({ id: '101', label: '101' }),
  makeRoom({ id: '103', label: '103' }),
  makeRoom({ id: '104', label: '104', status: 'available' }),
];
const tenants = [
  makeTenant({ id: 't-a', fullName: 'ก ไก่', phone: '' }),
  makeTenant({ id: 't-b', fullName: 'ข ไข่' }),
  makeTenant({ id: 't-c', fullName: 'ค ควาย' }),
];
const leases = [
  makeLease({ id: 'l-1', roomId: '101', tenantId: 't-a' }),
  makeLease({ id: 'l-2', roomId: '102', tenantId: 't-b' }),
  makeLease({ id: 'l-3', roomId: '104', tenantId: 't-c', endDate: new Date(2025, 1, 1) }),
];

describe('tenantRegister', () => {
  const reg = tenantRegister(tenants, leases, rooms, TODAY);

  it('lists current tenants in walking order', () => {
    expect(reg.current.map((l) => l.roomLabel)).toEqual(['101', '102']);
  });

  it('puts lived-in rooms with no lease first, as a problem', () => {
    expect(reg.missingLease.map((r) => r.label)).toEqual(['103']);
  });

  it('keeps tenants without a current lease, with their last room', () => {
    expect(reg.others.map((l) => [l.tenant.id, l.roomLabel])).toEqual([['t-c', '104']]);
  });

  it('flags missing data as gaps', () => {
    expect(reg.current[0]!.gaps).toContain('เบอร์โทร');
    expect(reg.current[1]!.gaps).toEqual([]);
  });

  it('searches by name, phone or room', () => {
    expect(tenantRegister(tenants, leases, rooms, TODAY, '102').current).toHaveLength(1);
    expect(tenantRegister(tenants, leases, rooms, TODAY, 'ไข่').current[0]!.tenant.id).toBe('t-b');
  });
});
