import { activeLeaseFor, type Lease } from '@/lib/models/lease';
import type { Bill } from '@/lib/models/bill';
import { settle, type Payment, type Settlement } from '@/lib/models/payment';
import { inWalkingOrder, isTenanted, isUnit, type Room } from '@/lib/models/room';
import type { Tenant } from '@/lib/models/tenant';
import type { MarkKind } from './marks';
import { consolePath } from './paths';

/**
 * The building as one picture (ตึกและห้อง): every room a window, showing who
 * lives there and where this cycle stands for it.
 *
 * The state answers "what does this room need from me this month?", so it is
 * worked out from the bill first and the room's registry status second:
 */
export type TileState =
  /** Billed this cycle and settled in full (or more). */
  | 'paid'
  /** Billed, part paid. */
  | 'partial'
  /** Billed, nothing in yet. */
  | 'unpaid'
  /** Someone lives here under a lease, but this cycle's bill is not out. */
  | 'unbilled'
  /** Someone lives here but there is no lease — nothing can be billed. */
  | 'missing'
  | 'vacant'
  /** Under repair: present, not in play. */
  | 'reno'
  /** A common space with no bill of its own. */
  | 'common';

export interface RoomTile {
  id: string;
  label: string;
  floor: number;
  state: TileState;
  mark: MarkKind;
  stateLabel: string;
  /** What fits in a window: a nickname, or the first word of the name. */
  shortName: string;
  tenantName: string | null;
  rentRate: number | null;
  occupantCount: number | null;
  settlement: Settlement | null;
  href: string;
}

const STATE: Record<TileState, { mark: MarkKind; label: string }> = {
  paid: { mark: 'done', label: 'จ่ายแล้ว' },
  partial: { mark: 'partial', label: 'จ่ายบางส่วน' },
  unpaid: { mark: 'todo', label: 'ออกบิลแล้ว รอจ่าย' },
  unbilled: { mark: 'todo', label: 'ยังไม่ออกบิล' },
  missing: { mark: 'missing', label: 'ไม่มีข้อมูลสัญญา' },
  vacant: { mark: 'none', label: 'ห้องว่าง' },
  reno: { mark: 'none', label: 'ปรับปรุง ไม่ออกบิล' },
  common: { mark: 'none', label: 'ส่วนกลาง' },
};

export function tileStateLabel(state: TileState): string {
  return STATE[state].label;
}

function shortNameOf(tenant: Tenant | undefined): string {
  if (!tenant) return '';
  const nickname = tenant.nickname.trim();
  return nickname || tenant.fullName.trim().split(/\s+/)[0] || '';
}

export interface BuildingInput {
  rooms: Room[];
  leases: Lease[];
  tenants: Tenant[];
  /** This cycle's bills. */
  bills: Bill[];
  payments: Payment[];
  today: Date;
}

export function buildingTiles({ rooms, leases, tenants, bills, payments, today }: BuildingInput): RoomTile[] {
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const billByRoom = new Map(bills.filter((b) => !b.archived).map((b) => [b.roomId, b]));

  return inWalkingOrder(rooms.filter((r) => !r.archived)).map((room) => {
    const lease = activeLeaseFor(
      leases.filter((l) => l.roomId === room.id),
      today,
    );
    const tenant = lease ? tenantById.get(lease.tenantId) : undefined;
    const bill = billByRoom.get(room.id);
    const settlement = bill ? settle(bill, payments) : null;

    let state: TileState;
    if (room.status === 'maintenance') state = 'reno';
    else if (settlement)
      state =
        settlement.state === 'paid' || settlement.state === 'overpaid'
          ? 'paid'
          : settlement.state === 'partial'
            ? 'partial'
            : 'unpaid';
    else if (isTenanted(room)) state = lease ? 'unbilled' : 'missing';
    else if (!isUnit(room)) state = 'common';
    else state = 'vacant';

    return {
      id: room.id,
      label: room.label,
      floor: room.floor,
      state,
      mark: STATE[state].mark,
      stateLabel: STATE[state].label,
      shortName: shortNameOf(tenant),
      tenantName: tenant ? tenant.fullName : null,
      rentRate: lease?.rentRate ?? room.rentRate,
      occupantCount: lease?.occupantCount ?? null,
      settlement,
      href: consolePath(`console/rooms/${encodeURIComponent(room.id)}`),
    };
  });
}

/** Top floor first, like looking at the building; ground-level spaces last. */
export function floorsOf(tiles: RoomTile[]): { label: string; short: string; tiles: RoomTile[] }[] {
  const floors = [...new Set(tiles.filter((t) => t.floor > 0).map((t) => t.floor))].sort((a, b) => b - a);
  const rows = floors.map((floor) => ({
    label: `ชั้น ${floor}`,
    short: String(floor),
    tiles: tiles.filter((t) => t.floor === floor),
  }));
  const ground = tiles.filter((t) => t.floor <= 0);
  if (ground.length > 0) rows.push({ label: 'ชั้นล่าง', short: 'ล่าง', tiles: ground });
  return rows;
}

export type TileFilter = 'all' | 'unpaid' | 'paid' | 'missing' | 'idle';

/** Which tiles a filter lights up. Filters highlight; they never hide. */
export function matchesFilter(tile: RoomTile, filter: TileFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'unpaid':
      return tile.state === 'unpaid' || tile.state === 'partial' || tile.state === 'unbilled';
    case 'paid':
      return tile.state === 'paid';
    case 'missing':
      return tile.state === 'missing';
    case 'idle':
      return tile.state === 'vacant' || tile.state === 'reno' || tile.state === 'common';
  }
}

export function parseTileFilter(raw: string | null): TileFilter {
  return raw === 'unpaid' || raw === 'paid' || raw === 'missing' || raw === 'idle' ? raw : 'all';
}

export function tileCounts(tiles: RoomTile[]): Record<TileFilter, number> {
  const count = (f: TileFilter) => tiles.filter((t) => matchesFilter(t, f)).length;
  return { all: tiles.length, unpaid: count('unpaid'), paid: count('paid'), missing: count('missing'), idle: count('idle') };
}
