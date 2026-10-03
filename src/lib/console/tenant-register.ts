import { activeLeaseFor, type Lease } from '@/lib/models/lease';
import { inWalkingOrder, isTenanted, type Room } from '@/lib/models/room';
import type { Tenant } from '@/lib/models/tenant';

/**
 * ผู้เช่าและสัญญา: people grouped by the room they live in.
 *
 * Now that leases exist (KS-11), a tenant *is* tied to a room, so the list is
 * in walking order like everything else — the tenant-only alphabetical list
 * it replaces was a stand-in for a relationship the data did not yet have.
 *
 * Three groups, problems first:
 * 1. rooms someone lives in with no lease — they block billing;
 * 2. tenants under a current lease, room by room;
 * 3. everyone else on file (moved out, or not yet placed).
 */

export interface TenantLine {
  tenant: Tenant;
  lease: Lease | null;
  roomLabel: string | null;
  /** Data the file should hold and does not — each one a "?" chip. */
  gaps: string[];
}

export interface TenantRegister {
  missingLease: Room[];
  current: TenantLine[];
  others: TenantLine[];
}

export function tenantGaps(tenant: Tenant): string[] {
  const gaps: string[] = [];
  if (!tenant.phone.trim()) gaps.push('เบอร์โทร');
  if (!tenant.idCardLast4.trim()) gaps.push('บัตร 4 ตัวท้าย');
  if (!tenant.address.houseNo.trim() && !tenant.address.province.trim()) gaps.push('ที่อยู่');
  return gaps;
}

function matches(line: TenantLine, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = line.tenant;
  return [t.fullName, t.nickname, t.phone, line.roomLabel ?? ''].some((v) => v.toLowerCase().includes(q));
}

export function tenantRegister(
  tenants: Tenant[],
  leases: Lease[],
  rooms: Room[],
  today: Date,
  query = '',
): TenantRegister {
  const live = rooms.filter((r) => !r.archived);
  const roomLabel = new Map(live.map((r) => [r.id, r.label]));
  const current: TenantLine[] = [];
  const placed = new Set<string>();
  const missingLease: Room[] = [];

  for (const room of inWalkingOrder(live)) {
    const lease = activeLeaseFor(
      leases.filter((l) => l.roomId === room.id),
      today,
    );
    if (!lease) {
      if (isTenanted(room)) missingLease.push(room);
      continue;
    }
    const tenant = tenants.find((t) => t.id === lease.tenantId);
    if (!tenant) continue;
    placed.add(tenant.id);
    current.push({ tenant, lease, roomLabel: room.label, gaps: tenantGaps(tenant) });
  }

  const others = tenants
    .filter((t) => !placed.has(t.id) && !t.archived)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'th'))
    .map((tenant) => {
      const last = leases
        .filter((l) => l.tenantId === tenant.id)
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
      return {
        tenant,
        lease: last ?? null,
        roomLabel: last ? (roomLabel.get(last.roomId) ?? last.roomId) : null,
        gaps: tenantGaps(tenant),
      };
    });

  return {
    missingLease: query.trim() ? missingLease.filter((r) => r.label.includes(query.trim())) : missingLease,
    current: current.filter((l) => matches(l, query)),
    others: others.filter((l) => matches(l, query)),
  };
}
