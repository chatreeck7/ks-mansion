import type { Lease } from '@/lib/models/lease';

/**
 * Every feature reads leases through this. Read-only for now, matching the
 * tenant repository — writes are their own card (see KS-8's note).
 *
 * `listLeasesForRoom` / `listLeasesForTenant` exist as first-class methods
 * rather than leaving callers to filter `listLeases()`: which field the
 * filter runs against is a storage concern, and a future backend could index
 * it. Keeping it behind the interface is what lets that change later.
 */
export interface LeaseRepository {
  listLeases(): Promise<Lease[]>;
  listLeasesForRoom(roomId: string): Promise<Lease[]>;
  listLeasesForTenant(tenantId: string): Promise<Lease[]>;
}
