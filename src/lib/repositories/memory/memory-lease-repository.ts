import type { Lease } from '@/lib/models/lease';
import type { LeaseDraft, LeaseRepository } from '../lease-repository';
import { createMemoryStore } from './memory-store';

/**
 * Fallback for local dev and tests. Fictional, and keyed to the fictional
 * tenants in memory-tenant-repository.ts.
 *
 * Deliberately covers the shapes worth being able to see locally: an
 * open-ended tenancy, a fixed term that ended normally, one that ended with
 * the tenant absconding (หนี — common enough in the real log to be a normal
 * outcome), and a room transfer, where `previousLeaseId` keeps one tenancy
 * from reading as two shorter ones.
 *
 * Rents match the corrected per-room rates in memory-room-repository.ts —
 * rent alone, never a month's total.
 */
export const SEED_LEASES: Lease[] = [
  {
    id: 'l-001',
    roomId: '101',
    tenantId: 't-001',
    startDate: new Date(2025, 0, 1),
    endDate: null,
    signedDate: new Date(2024, 11, 28),
    rentRate: 2200,
    deposit: 5000,
    advanceRent: 2200,
    occupantCount: 2,
    endReason: null,
    previousLeaseId: null,
    archived: false,
  },
  {
    id: 'l-002',
    roomId: '102',
    tenantId: 't-002',
    startDate: new Date(2025, 2, 1),
    endDate: new Date(2026, 1, 28),
    signedDate: new Date(2025, 1, 25),
    rentRate: 3000,
    deposit: 9000,
    advanceRent: 3000,
    occupantCount: 1,
    endReason: 'normal',
    previousLeaseId: null,
    archived: false,
  },
  {
    id: 'l-003',
    roomId: '103',
    tenantId: 't-003',
    startDate: new Date(2023, 0, 1),
    endDate: new Date(2023, 11, 31),
    signedDate: new Date(2022, 11, 20),
    rentRate: 2500,
    deposit: 6000,
    advanceRent: 2500,
    occupantCount: 1,
    endReason: 'absconded',
    previousLeaseId: null,
    archived: false,
  },
  {
    // t-002 moved 102 → 105 rather than leaving; one tenancy, two rooms.
    id: 'l-004',
    roomId: '105',
    tenantId: 't-002',
    startDate: new Date(2026, 2, 1),
    endDate: null,
    signedDate: new Date(2026, 1, 20),
    rentRate: 2500,
    deposit: 9000,
    advanceRent: 2500,
    occupantCount: 1,
    endReason: null,
    previousLeaseId: 'l-002',
    archived: false,
  },
];

function copy(lease: Lease): Lease {
  return { ...lease };
}

/** The mutable store local dev writes into — see memory-tenant-repository. */
const store: Lease[] = SEED_LEASES.map(copy);

export function createMemoryLeaseRepository(leases: Lease[] = store): LeaseRepository {
  const crud = createMemoryStore<Lease, LeaseDraft>(leases, {
    label: 'lease',
    idPrefix: 'l-',
    copy,
  });

  return {
    listLeases: crud.list,
    getLease: crud.get,
    createLease: crud.create,
    updateLease: crud.update,
    archiveLease: crud.archive,

    async listLeasesForRoom(roomId: string) {
      return (await crud.list()).filter((l) => l.roomId === roomId);
    },
    async listLeasesForTenant(tenantId: string) {
      return (await crud.list()).filter((l) => l.tenantId === tenantId);
    },
  };
}
