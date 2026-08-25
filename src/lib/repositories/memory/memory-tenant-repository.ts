import type { Tenant } from '@/lib/models/tenant';
import type { TenantRepository } from '../tenant-repository';

/**
 * Fallback for local dev and tests, used when Sheets credentials are absent.
 *
 * Deliberately **fictional** people, unlike the room seed which carries real
 * rents. Tenant records are personal data; checking real names, addresses and
 * phone numbers into the repository would defeat the point of keeping even the
 * ID card down to four digits.
 *
 * The three profiles differ on purpose — a graded tenant with a full address,
 * an ungraded one with a sparse address, and one with a note — so the detail
 * screen's empty states are visible locally without editing the seed.
 */
export const SEED_TENANTS: Tenant[] = [
  {
    id: 't-001',
    fullName: 'สมชาย ตัวอย่าง',
    nickname: 'ชาย',
    idCardLast4: '1234',
    address: {
      houseNo: '1/1',
      road: 'ตัวอย่าง',
      subdistrict: 'ในเมือง',
      district: 'เมือง',
      province: 'ตัวอย่าง',
      postcode: '10000',
    },
    phone: '080-000-0001',
    occupation: 'พนักงานบริษัท',
    evaluationGrade: 'A',
    note: '',
  },
  {
    id: 't-002',
    fullName: 'สมหญิง ตัวอย่าง',
    nickname: '',
    idCardLast4: '5678',
    address: {
      houseNo: '2',
      road: '',
      subdistrict: '',
      district: '',
      province: 'ตัวอย่าง',
      postcode: '',
    },
    phone: '080-000-0002',
    occupation: 'ค้าขาย',
    evaluationGrade: null,
    note: '(เลี้ยงแมว)',
  },
  {
    id: 't-003',
    fullName: 'สมศักดิ์ ตัวอย่าง',
    nickname: 'ศักดิ์',
    idCardLast4: '9012',
    address: {
      houseNo: '',
      road: '',
      subdistrict: '',
      district: '',
      province: '',
      postcode: '',
    },
    phone: '',
    occupation: '',
    evaluationGrade: 'C',
    note: '',
  },
];

/** Hand callers their own copy so mutations cannot reach the seed. */
function copy(tenant: Tenant): Tenant {
  return { ...tenant, address: { ...tenant.address } };
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
