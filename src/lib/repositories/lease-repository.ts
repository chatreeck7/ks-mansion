import type { Lease } from '@/lib/models/lease';

/** See TenantDraft for why `id` and `archived` are excluded. */
export type LeaseDraft = Omit<Lease, 'id' | 'archived'>;

export interface LeaseRepository {
  /** All exclude archived leases. */
  listLeases(): Promise<Lease[]>;
  listLeasesForRoom(roomId: string): Promise<Lease[]>;
  listLeasesForTenant(tenantId: string): Promise<Lease[]>;
  /** Returns an archived lease too, so history stays reachable. */
  getLease(id: string): Promise<Lease | null>;

  createLease(draft: LeaseDraft): Promise<Lease>;
  updateLease(id: string, changes: Partial<LeaseDraft>): Promise<Lease>;
  archiveLease(id: string): Promise<Lease>;
}
