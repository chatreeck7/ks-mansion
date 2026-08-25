import type { Tenant } from '@/lib/models/tenant';
import type { TenantRepository } from '../tenant-repository';

/**
 * Fallback for local dev and tests, used when Sheets credentials are absent.
 *
 * Deliberately **fictional** people, unlike the room seed which carries real
 * rents. Tenant records are personal data; checking real names, addresses and
 * phone numbers into the repository would defeat the point of keeping even the
 * ID card down to four digits.
 */
export const SEED_TENANTS: Tenant[] = [
  {
    id: 't-001',
    fullName: 'สมชาย ตัวอย่าง',
    nickname: 'ชาย',
    idCardLast4: '1234',
    address: '1 ถนนตัวอย่าง ต.ในเมือง',
    phone: '080-000-0001',
  },
  {
    id: 't-002',
    fullName: 'สมหญิง ตัวอย่าง',
    nickname: '',
    idCardLast4: '5678',
    address: '2 ถนนตัวอย่าง ต.ในเมือง',
    phone: '080-000-0002',
  },
];

/** Hand callers their own copy so mutations cannot reach the seed. */
function copy(tenant: Tenant): Tenant {
  return { ...tenant };
}

export function createMemoryTenantRepository(
  tenants: Tenant[] = SEED_TENANTS,
): TenantRepository {
  const byId = new Map(tenants.map((t) => [t.id, t]));
  return {
    async listTenants() {
      return tenants.map(copy);
    },
    async getTenant(id: string) {
      const tenant = byId.get(id);
      return tenant ? copy(tenant) : null;
    },
  };
}
