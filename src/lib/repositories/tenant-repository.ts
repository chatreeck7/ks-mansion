import type { Tenant } from '@/lib/models/tenant';

/**
 * Every feature reads tenants through this. Implementations live under
 * src/lib/repositories/<backend>/ and are the only code allowed to know
 * where tenants are actually stored.
 *
 * Read-only for now: writes need the `spreadsheets` scope, batchUpdate, and
 * the no-transaction handling documented in docs/data-layer.md — a separate
 * card. Tenants are entered directly in the sheet meanwhile, which is the
 * working mode this datastore was chosen for.
 */
export interface TenantRepository {
  listTenants(): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | null>;
}
