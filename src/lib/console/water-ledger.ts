import { formatBaht, formatThaiDate } from '@/lib/format/thai';
import type { LedgerColumn, LedgerGroup, LedgerRow } from '@/lib/models/ledger';
import {
  activeLeaseFor,
  waterChargeFor,
  WATER_RATE_PER_OCCUPANT,
  type Lease,
} from '@/lib/models/lease';
import { readingCharge, type MeterReading } from '@/lib/models/meter-reading';
import { inWalkingOrder, type Room } from '@/lib/models/room';

/**
 * ค่าน้ำ per room for a cycle (KS-19).
 *
 * **Water is not a free number typed per room**, which is what AC-1.4's
 * wording implies and what the card corrected: it is `จำนวนผู้พัก × 100`.
 * That is why the only values in the real sheet are 100 and 200. The manual
 * part is keeping the occupant count right, so that is what this screen puts
 * in front of someone — the count, with the charge it produces beside it.
 *
 * **ร้านซักผ้า is the exception and stays visible as one.** It has a real
 * water meter billed per unit, so its row shows the metered charge and offers
 * no occupant field. A single "manual amount" column would have covered both
 * cases and lost why each number is what it is.
 */

export const WATER_COLUMNS: LedgerColumn[] = [
  { key: 'room', header: 'ห้อง' },
  { key: 'basis', header: 'คิดจาก' },
  { key: 'occupants', header: 'จำนวนผู้พัก', align: 'right' },
  { key: 'charge', header: 'ค่าน้ำ', align: 'right' },
];

/** How this room's water is worked out — the two are not interchangeable. */
export type WaterBasis = 'occupancy' | 'metered';

export interface WaterRow {
  roomId: string;
  roomLabel: string;
  /** The tenancy the count belongs to; a count is per lease, not per room. */
  leaseId: string;
  basis: WaterBasis;
  /** Null on a metered room, which has no headcount in its water charge. */
  occupantCount: number | null;
  /** Null on a metered room whose meter has never been read. */
  charge: number | null;
  /** Units consumed, metered rooms only. */
  units: number | null;
}

/** The field carries the lease, because the count belongs to the tenancy. */
export function occupantFieldName(row: WaterRow): string {
  return `occupants:${row.leaseId}`;
}

/** True when this room's water comes off a meter rather than a headcount. */
function hasWaterMeter(roomId: string, readings: MeterReading[]): boolean {
  return readings.some((r) => r.roomId === roomId && r.meterType === 'water');
}

function latestWaterReading(roomId: string, readings: MeterReading[]): MeterReading | null {
  let latest: MeterReading | null = null;
  for (const reading of readings) {
    if (reading.roomId !== roomId || reading.meterType !== 'water') continue;
    if (!latest || reading.readDate.getTime() >= latest.readDate.getTime()) latest = reading;
  }
  return latest;
}

/**
 * One row per **tenanted** space, in walking order.
 *
 * A vacant room is left out rather than shown at zero: nobody is billed for
 * water there, and a zero in a column of real charges reads like a figure
 * somebody forgot to fill in — which is precisely the confusion this screen
 * exists to remove.
 */
export function waterRows(
  rooms: Room[],
  leases: Lease[],
  readings: MeterReading[],
  on: Date,
): WaterRow[] {
  const rows: WaterRow[] = [];

  for (const room of inWalkingOrder(rooms.filter((r) => !r.archived))) {
    const lease = activeLeaseFor(
      leases.filter((l) => l.roomId === room.id),
      on,
    );
    if (!lease) continue;

    if (hasWaterMeter(room.id, readings)) {
      const latest = latestWaterReading(room.id, readings);
      rows.push({
        roomId: room.id,
        roomLabel: room.label,
        leaseId: lease.id,
        basis: 'metered',
        occupantCount: null,
        charge: latest ? readingCharge(latest) : null,
        units: latest ? latest.currentReading - latest.previousReading : null,
      });
      continue;
    }

    rows.push({
      roomId: room.id,
      roomLabel: room.label,
      leaseId: lease.id,
      basis: 'occupancy',
      occupantCount: lease.occupantCount,
      charge: waterChargeFor(lease),
      units: null,
    });
  }

  return rows;
}

export function waterTotal(rows: WaterRow[]): number {
  return rows.reduce((total, row) => total + (row.charge ?? 0), 0);
}

/** Just enough of `FormData` to read the grid back without a DOM. */
export interface SubmittedCounts {
  get(name: string): FormDataEntryValue | null;
}

export function toWaterGroups(
  rows: WaterRow[],
  cycleDate: Date,
  submitted?: SubmittedCounts,
): LedgerGroup[] {
  const ledgerRows: LedgerRow[] = rows.map((row): LedgerRow => {
    const typed = submitted?.get(occupantFieldName(row));
    const value = typeof typed === 'string' ? typed : String(row.occupantCount ?? '');

    return {
      id: row.leaseId,
      cells: {
        room: { kind: 'text', value: row.roomLabel },
        basis: {
          kind: 'text',
          // Says *why* the number is what it is, which a bare amount cannot.
          value:
            row.basis === 'metered'
              ? `มิเตอร์น้ำ${row.units === null ? '' : ` ${formatBaht(row.units)} หน่วย`}`
              : `เหมา ${formatBaht(WATER_RATE_PER_OCCUPANT)}/คน`,
          muted: true,
        },
        occupants:
          row.basis === 'metered'
            ? // No headcount goes into a metered charge, so there is nothing
              // here to edit — and an editable zero would invite someone to
              // "fix" it.
              { kind: 'text', value: '—', muted: true }
            : {
                kind: 'input',
                name: occupantFieldName(row),
                value,
                label: `จำนวนผู้พัก ${row.roomLabel}`,
              },
        charge: { kind: 'figure', value: row.charge },
      },
    };
  });

  return [{ label: `รอบวันที่ ${formatThaiDate(cycleDate)}`, rows: ledgerRows }];
}

export interface OccupantUpdate {
  leaseId: string;
  occupantCount: number;
}

export interface OccupantSubmission {
  /** Only rows whose count actually changed — an unchanged grid writes nothing. */
  updates: OccupantUpdate[];
  errors: string[];
}

/**
 * Reads back the counts, and refuses a blank one.
 *
 * **A blank is an error here, not "leave it alone."** The field arrives
 * pre-filled with the current count, so an empty one means somebody cleared
 * it — and that is the exact silent failure the source spreadsheet warns
 * about in its own instructions: *"กรณีที่มีห้องเข้าพักใหม่ต้องกรอกว่าเหมา
 * 100 หรือ 200 หากไม่กรอกจะคำนวนผิดพลาด"*. Treating it as no-change would
 * bill the room at whatever stale figure was already there, quietly.
 *
 * Zero is accepted, and is not the same thing: a shop on its own water meter
 * genuinely houses nobody.
 */
export function occupantUpdatesFromForm(
  rows: WaterRow[],
  form: SubmittedCounts,
): OccupantSubmission {
  const updates: OccupantUpdate[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    if (row.basis !== 'occupancy') continue;

    const raw = form.get(occupantFieldName(row));
    if (typeof raw !== 'string') continue;

    const trimmed = raw.trim();
    if (trimmed === '') {
      errors.push(`${row.roomLabel}: ต้องกรอกจำนวนผู้พัก — เว้นว่างไว้จะคิดค่าน้ำผิด`);
      continue;
    }

    const count = Number(trimmed.replace(/,/g, ''));
    if (!Number.isInteger(count) || count < 0) {
      errors.push(`${row.roomLabel}: จำนวนผู้พักต้องเป็นจำนวนเต็ม ไม่ติดลบ (ได้ "${trimmed}")`);
      continue;
    }

    // Unchanged rows write nothing: this screen is opened to check 27 rooms
    // and change one, and re-writing all of them would be 27 sheet round
    // trips to record no new fact.
    if (count !== row.occupantCount) updates.push({ leaseId: row.leaseId, occupantCount: count });
  }

  return { updates, errors };
}
