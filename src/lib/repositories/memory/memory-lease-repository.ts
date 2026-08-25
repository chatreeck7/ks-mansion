import type { Lease } from '@/lib/models/lease';
import type { LeaseRepository } from '../lease-repository';

/**
 * Fallback for local dev and tests. Fictional, and keyed to the fictional
 * tenants in memory-tenant-repository.ts.
 *
 * Deliberately covers three shapes worth being able to see locally: an
 * open-ended tenancy, a fixed-term one, and an expired one on a room that is
 * now vacant.
 */
export const SEED_LEASES: Lease[] = [
  {
    id: 'l-001',
    roomId: '101',
    tenantId: 't-001',
    startDate: new Date(2025, 0, 1),
    endDate: null,
    rentRate: 2636,
    deposit: 5000,
    advanceRent: 2636,
  },
  {
    id: 'l-002',
    roomId: '102',
    tenantId: 't-002',
    startDate: new Date(2025, 2, 1),
    endDate: new Date(2026, 1, 28),
    rentRate: 4563,
    deposit: 9000,
    advanceRent: 4563,
  },
  {
    id: 'l-003',
    roomId: '103',
    tenantId: 't-001',
    startDate: new Date(2023, 0, 1),
    endDate: new Date(2023, 11, 31),
    rentRate: 3027,
    deposit: 6000,
    advanceRent: 3027,
  },
];

function copy(lease: Lease): Lease {
  return { ...lease };
}

export function createMemoryLeaseRepository(leases: Lease[] = SEED_LEASES): LeaseRepository {
  return {
    async listLeases() {
      return leases.map(copy);
    },
    async listLeasesForRoom(roomId: string) {
      return leases.filter((l) => l.roomId === roomId).map(copy);
    },
    async listLeasesForTenant(tenantId: string) {
      return leases.filter((l) => l.tenantId === tenantId).map(copy);
    },
  };
}
