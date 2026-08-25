import type { LedgerColumn, LedgerGroup, LedgerRow } from '@/lib/models/ledger';
import { displayName, type Tenant } from '@/lib/models/tenant';
import { consolePath } from './paths';

export const TENANT_COLUMNS: LedgerColumn[] = [
  { key: 'name', header: 'ผู้เช่า' },
  { key: 'phone', header: 'โทรศัพท์' },
];

function toRow(tenant: Tenant): LedgerRow {
  return {
    id: tenant.id,
    href: consolePath(`console/tenants/${tenant.id}`),
    cells: {
      name: { kind: 'text', value: displayName(tenant) },
      // Em dash rather than an empty cell, matching the console's convention
      // for a value that simply is not on record.
      phone: { kind: 'text', value: tenant.phone || '—' },
    },
  };
}

/**
 * One flat group, sorted by name.
 *
 * Rooms group by floor because that mirrors walking the building; tenants have
 * no such physical order. Grouping by room was considered and rejected — a
 * tenant is not tied to a room until KS-11 adds the lease record, and inventing
 * that link here would encode a relationship the data does not yet have.
 */
export function toTenantGroups(tenants: Tenant[]): LedgerGroup[] {
  if (tenants.length === 0) return [];

  return [
    {
      label: 'ผู้เช่าทั้งหมด',
      rows: [...tenants]
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'th'))
        .map(toRow),
    },
  ];
}
