import { monthsBetween } from '@/lib/console/evaluation-report';
import { previousCycle, type BillingCycle } from '@/lib/models/billing-cycle';
import { activeLeaseFor, endReasonLabel, settlementLabel, type Lease } from '@/lib/models/lease';
import { inWalkingOrder, isUnit, type Room } from '@/lib/models/room';
import { displayName, type Tenant } from '@/lib/models/tenant';

/**
 * บัญชีแจ้งคนเข้า-ออก, rewritten to be read.
 *
 * The family's sheet packs both directions into one twelve-column row — a
 * move-in on the left and an unrelated move-out on the right, sharing a line
 * only because they were written down on the same day, with `+`/`-` doing the
 * work of words. This keeps every fact on it and splits it into what someone
 * actually asks: who came in (and did they pay what was due), who left (how
 * long they stayed, why, and how the deposit was settled), and which rooms
 * stand empty now.
 *
 * Everything is read off the leases: start/end, the move-in and move-out
 * amounts (AC-2.3), the end reason and the transfer link. Nothing is typed
 * twice.
 */

export interface MovementPeriod {
  from: Date;
  to: Date;
}

/**
 * Since the last report: the day after the previous cycle's issue date up to
 * and including this one's — the family files the register with the bills on
 * the 26th, so each sheet picks up where the last stopped.
 */
export function movementPeriodFor(cycle: BillingCycle): MovementPeriod {
  const previous = previousCycle(cycle).issueDate;
  return {
    from: new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 1),
    to: cycle.issueDate,
  };
}

export interface MoveIn {
  leaseId: string;
  date: Date;
  roomLabel: string;
  tenant: string;
  rentRate: number;
  deposit: number;
  advanceRent: number;
  /** ยอดจ่าย / จ่ายจริง on moving in; null is "not recorded". */
  due: number | null;
  paid: number | null;
  /** Still owed on the move-in money, when both figures are known. */
  outstanding: number | null;
  /** `ย้ายมาจากห้อง 204` for a room transfer. */
  transferFrom: string | null;
}

export interface MoveOut {
  leaseId: string;
  date: Date;
  roomLabel: string;
  tenant: string;
  /** อยู่มา, counted from the first room when they transferred within the building. */
  stayed: string;
  /** สาเหตุ: หนี / สิ้นสุดตามปกติ / ย้ายไปห้อง X. */
  reason: string;
  absconded: boolean;
  /** `คืน 1,000` / `เก็บเพิ่ม 578` — the deposit settlement in words. */
  settlement: string | null;
  paid: number | null;
}

export interface VacantRoom {
  roomLabel: string;
  since: Date | null;
}

export interface MovementRegister {
  period: MovementPeriod;
  moveIns: MoveIn[];
  moveOuts: MoveOut[];
  /** Units with no tenancy on the last day of the period. */
  vacant: VacantRoom[];
  /** Rooms that have given notice and are still living there. */
  leaving: Array<{ roomLabel: string; until: Date | null }>;
}

function dayOf(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function within(date: Date, period: MovementPeriod): boolean {
  const day = dayOf(date);
  return day >= dayOf(period.from) && day <= dayOf(period.to);
}

/** `1 ปี 6 เดือน`, `8 เดือน`, `ไม่ถึงเดือน`. */
export function stayLabel(from: Date, to: Date): string {
  const months = monthsBetween(from, to);
  if (months === 0) return 'ไม่ถึงเดือน';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years > 0 ? `${years} ปี` : '', rest > 0 ? `${rest} เดือน` : ''].filter(Boolean).join(' ');
}

export function movementRegisterFor(
  period: MovementPeriod,
  rooms: readonly Room[],
  leases: readonly Lease[],
  tenants: readonly Tenant[],
): MovementRegister {
  const live = leases.filter((lease) => !lease.archived);
  const roomLabel = new Map(rooms.map((room) => [room.id, room.label]));
  const label = (roomId: string) => roomLabel.get(roomId) ?? roomId;
  const tenantName = new Map(tenants.map((tenant) => [tenant.id, displayName(tenant)]));
  const name = (lease: Lease) => tenantName.get(lease.tenantId) ?? '';
  const byId = new Map(live.map((lease) => [lease.id, lease]));
  const continuedBy = new Map<string, Lease>();
  for (const lease of live) if (lease.previousLeaseId) continuedBy.set(lease.previousLeaseId, lease);

  /** The first lease of a chain of room transfers — when they arrived. */
  const firstOf = (lease: Lease): Lease => {
    let current = lease;
    const seen = new Set<string>();
    while (current.previousLeaseId && !seen.has(current.id)) {
      seen.add(current.id);
      const previous = byId.get(current.previousLeaseId);
      if (!previous) break;
      current = previous;
    }
    return current;
  };

  const moveIns: MoveIn[] = live
    .filter((lease) => within(lease.startDate, period))
    .sort((a, b) => dayOf(a.startDate) - dayOf(b.startDate))
    .map((lease) => {
      const previous = lease.previousLeaseId ? byId.get(lease.previousLeaseId) : undefined;
      return {
        leaseId: lease.id,
        date: lease.startDate,
        roomLabel: label(lease.roomId),
        tenant: name(lease),
        rentRate: lease.rentRate,
        deposit: lease.deposit,
        advanceRent: lease.advanceRent,
        due: lease.moveInDue,
        paid: lease.moveInPaid,
        outstanding:
          lease.moveInDue !== null && lease.moveInPaid !== null ? Math.max(0, lease.moveInDue - lease.moveInPaid) : null,
        transferFrom: previous ? `ย้ายมาจากห้อง ${label(previous.roomId)}` : null,
      };
    });

  const moveOuts: MoveOut[] = live
    .filter((lease): lease is Lease & { endDate: Date } => lease.endDate !== null && within(lease.endDate, period))
    .sort((a, b) => dayOf(a.endDate) - dayOf(b.endDate))
    .map((lease) => {
      const next = continuedBy.get(lease.id);
      return {
        leaseId: lease.id,
        date: lease.endDate,
        roomLabel: label(lease.roomId),
        tenant: name(lease),
        stayed: stayLabel(firstOf(lease).startDate, lease.endDate),
        reason: next ? `ย้ายไปห้อง ${label(next.roomId)}` : endReasonLabel(lease.endReason) || 'ออก',
        absconded: lease.endReason === 'absconded',
        settlement: lease.moveOutDue === null ? null : settlementLabel(lease.moveOutDue),
        paid: lease.moveOutPaid,
      };
    });

  const units = inWalkingOrder(rooms.filter((room) => !room.archived && isUnit(room)));
  const vacant: VacantRoom[] = [];
  const leaving: MovementRegister['leaving'] = [];
  for (const room of units) {
    const own = live.filter((lease) => lease.roomId === room.id);
    const current = activeLeaseFor(own, period.to);
    if (!current) {
      const ended = own
        .filter((lease) => lease.endDate !== null && dayOf(lease.endDate) <= dayOf(period.to))
        .sort((a, b) => dayOf(b.endDate!) - dayOf(a.endDate!))[0];
      vacant.push({
        roomLabel: room.label,
        since: ended ? new Date(ended.endDate!.getFullYear(), ended.endDate!.getMonth(), ended.endDate!.getDate() + 1) : null,
      });
    } else if (room.status === 'noticeGiven') {
      leaving.push({ roomLabel: room.label, until: current.endDate });
    }
  }

  return { period, moveIns, moveOuts, vacant, leaving };
}
