import { activeLeaseFor, type Lease } from '@/lib/models/lease';
import { inWalkingOrder, isUnit, type Room } from '@/lib/models/room';
import type { EvaluationGrade, Tenant } from '@/lib/models/tenant';

/**
 * ผลประเมินผู้เช่า, as of a day (KS-15).
 *
 * The family's own report (ผลประเมินผู้เช่าห้องพัก, อาชีพ — 26/10/69) is one
 * row per room in walking order: how many live there (one `*` each), the
 * occupation, the grade and the phone, with the A/B/C legend beside it. This
 * builds that table from the tenancies running on the day, and the figures
 * the charts above it draw: grades, occupancy per floor, and how long the
 * current tenants have stayed.
 *
 * Pure, like every console document builder: the page reads, this shapes.
 */

export interface EvaluationRow {
  roomId: string;
  roomLabel: string;
  floor: number;
  /** Null when the room has no running tenancy. */
  occupants: number | null;
  tenantId: string | null;
  tenantName: string | null;
  occupation: string;
  grade: EvaluationGrade | null;
  /** The grade cell's note, e.g. เลี้ยงแมว, taken from the tenant's note. */
  phone: string;
  /** Whole months since the tenancy began. */
  monthsStayed: number | null;
}

export type GradeKey = EvaluationGrade | 'none';

export interface FloorOccupancy {
  floor: number;
  occupied: number;
  vacant: number;
  occupants: number;
}

export interface TenureBucket {
  label: string;
  count: number;
}

export interface EvaluationReport {
  asOf: Date;
  rows: EvaluationRow[];
  grades: Record<GradeKey, number>;
  floors: FloorOccupancy[];
  tenure: TenureBucket[];
  occupiedRooms: number;
  totalRooms: number;
  totalOccupants: number;
}

export const GRADE_LABELS: Record<GradeKey, string> = {
  A: 'A ดีมาก',
  B: 'B ดี',
  C: 'C พอใช้ได้',
  none: 'ยังไม่ประเมิน',
};

/** Tenure bands, upper bound in months (exclusive). */
const TENURE_BANDS: Array<{ label: string; below: number }> = [
  { label: 'ไม่ถึง 6 เดือน', below: 6 },
  { label: '6–12 เดือน', below: 12 },
  { label: '1–2 ปี', below: 24 },
  { label: '2–5 ปี', below: 60 },
  { label: '5 ปีขึ้นไป', below: Infinity },
];

export function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

export function evaluationReportFor(
  rooms: readonly Room[],
  leases: readonly Lease[],
  tenants: readonly Tenant[],
  asOf: Date,
): EvaluationReport {
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const leaseOn = (room: Room) =>
    activeLeaseFor(
      leases.filter((l) => l.roomId === room.id && !l.archived),
      asOf,
    );
  // A common space (ห้องเช่าส่วนกลาง, ห้องใต้ถุน) only belongs on the report
  // while someone rents it; an empty one is not a room waiting for a tenant
  // (owner, 9 พ.ย. 2569). Vacant units still show as ว่าง.
  const listed = inWalkingOrder(rooms.filter((room) => !room.archived))
    .map((room) => ({ room, lease: leaseOn(room) }))
    .filter(({ room, lease }) => isUnit(room) || lease !== null);
  const rows: EvaluationRow[] = listed.map(({ room, lease }) => {
    const tenant = lease ? tenantById.get(lease.tenantId) ?? null : null;
    return {
      roomId: room.id,
      roomLabel: room.label,
      floor: room.floor,
      occupants: lease ? lease.occupantCount : null,
      // Occupancy follows the lease: a tenancy whose tenant record is missing
      // is still an occupied room, just one with nothing to print beside it.
      tenantId: lease?.tenantId ?? null,
      tenantName: tenant?.fullName ?? null,
      occupation: tenant?.occupation ?? '',
      grade: tenant?.evaluationGrade ?? null,
      phone: tenant?.phone ?? '',
      monthsStayed: lease ? monthsBetween(lease.startDate, asOf) : null,
    };
  });

  const tenanted = rows.filter((row) => row.tenantId !== null);
  const grades: Record<GradeKey, number> = { A: 0, B: 0, C: 0, none: 0 };
  for (const row of tenanted) grades[row.grade ?? 'none'] += 1;

  const floorNumbers = [...new Set(rows.map((row) => row.floor))].sort((a, b) => a - b);
  const floors = floorNumbers.map((floor) => {
    const onFloor = rows.filter((row) => row.floor === floor);
    const occupied = onFloor.filter((row) => row.tenantId !== null);
    return {
      floor,
      occupied: occupied.length,
      vacant: onFloor.length - occupied.length,
      occupants: occupied.reduce((sum, row) => sum + (row.occupants ?? 0), 0),
    };
  });

  const tenure = TENURE_BANDS.map((band, index) => {
    const above = index === 0 ? 0 : TENURE_BANDS[index - 1]!.below;
    return {
      label: band.label,
      count: tenanted.filter(
        (row) => row.monthsStayed !== null && row.monthsStayed >= above && row.monthsStayed < band.below,
      ).length,
    };
  });

  return {
    asOf,
    rows,
    grades,
    floors,
    tenure,
    occupiedRooms: tenanted.length,
    totalRooms: rows.length,
    totalOccupants: tenanted.reduce((sum, row) => sum + (row.occupants ?? 0), 0),
  };
}
