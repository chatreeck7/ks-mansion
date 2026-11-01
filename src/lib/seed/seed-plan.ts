import { parseThaiDate } from '@/lib/format/thai-parse';
import type { BillDraft } from '@/lib/models/bill';
import type { EvaluationGrade } from '@/lib/models/tenant';
import { EMPTY_ADDRESS } from '@/lib/models/tenant';
import type { MeterReadingDraft, MeterType } from '@/lib/models/meter-reading';
import type { RoomAppliances, RoomStatus } from '@/lib/models/room';
import type { LeaseDraft } from '@/lib/repositories/lease-repository';
import type { RoomEdit } from '@/lib/repositories/room-repository';
import type { TenantDraft } from '@/lib/repositories/tenant-repository';

/**
 * Seeding the datastore from a month's paperwork.
 *
 * The family's monthly files (รายการค่าไฟและค่าห้อง, ผลประเมินผู้เช่า,
 * บัญชีแจ้งคนเข้า-ออก) are the record the console replaces. Moving onto the
 * console means loading one month of them as the starting state — and
 * **the bills that already went out on paper are loaded as they were
 * issued**, not re-planned, because a tenant is holding that paper.
 *
 * The dataset is a JSON file kept *out of the repository*: it carries
 * tenants' phone numbers, and this module only ever sees it as data. This
 * module is pure — it checks the dataset and turns it into the drafts the
 * repositories already accept, so the seed goes through the same
 * parse-before-write guard as every console write. Nothing here writes.
 *
 * It checks the paperwork against itself before anything reaches the sheet:
 * every bill's ค่าไฟ must multiply back out of the meter reading beside it,
 * and the bills must add up to the report's own รวมทั้งสิ้น. A transcription
 * slip fails here, by name, instead of becoming a wrong bill on the screen.
 */

/** Dates are written the way the paperwork writes them: `29/3/2566`. */
export interface SeedRoom {
  id: string;
  status: RoomStatus;
  rentRate?: number | null;
  hasMeter?: boolean;
  appliances?: RoomAppliances;
}

export interface SeedTenancy {
  roomId: string;
  tenant: {
    fullName: string;
    nickname?: string;
    phone?: string;
    occupation?: string;
    evaluationGrade?: EvaluationGrade | null;
    note?: string;
  };
  lease: {
    startDate: string;
    rentRate: number;
    deposit: number;
    advanceRent: number;
    occupantCount: number;
    moveInDue: number | null;
    moveInPaid: number | null;
  };
}

export interface SeedReading {
  roomId: string;
  meterType: MeterType;
  readDate: string;
  previousReading: number;
  currentReading: number;
  ratePerUnit: number;
  note?: string | null;
}

export interface SeedBill {
  roomId: string;
  cycle: string;
  issueDate: string;
  dueDate: string;
  rentAmount: number;
  electricityAmount: number;
  waterAmount: number;
  electricityPrevious: number | null;
  electricityCurrent: number | null;
  waterQuantity: number | null;
  arrearsNote: string | null;
}

export interface SeedDataset {
  label: string;
  /** The report's own รวมทั้งสิ้น — what the bills must add up to. */
  expectedBillTotal: number;
  rooms: SeedRoom[];
  tenancies: SeedTenancy[];
  readings: SeedReading[];
  bills: SeedBill[];
}

export interface PlannedTenancy {
  roomId: string;
  tenant: TenantDraft;
  /** Everything but the tenant id, which only exists once the tenant is written. */
  lease: Omit<LeaseDraft, 'tenantId'>;
}

export interface SeedPlan {
  roomChanges: Array<{ id: string; changes: Partial<RoomEdit> }>;
  tenancies: PlannedTenancy[];
  readings: MeterReadingDraft[];
  /** Lease id is resolved at write time, from the leases just created. */
  bills: Array<Omit<BillDraft, 'leaseId'>>;
  billTotal: number;
}

export class SeedDatasetError extends Error {
  constructor(readonly problems: string[]) {
    super(`The seed dataset has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.name = 'SeedDatasetError';
  }
}

/**
 * Checks a dataset and plans its writes. Collects every problem before
 * throwing, so one run names them all rather than one per attempt.
 *
 * `knownRoomIds` is the rooms tab as it stands: the seed edits rooms, it
 * never invents them.
 */
export function planSeed(dataset: SeedDataset, knownRoomIds: readonly string[]): SeedPlan {
  const problems: string[] = [];
  const known = new Set(knownRoomIds);

  const date = (raw: string, where: string): Date => {
    const parsed = parseThaiDate(raw ?? '');
    if (!parsed) problems.push(`${where}: "${raw}" is not a date`);
    return parsed ?? new Date(NaN);
  };
  const room = (id: string, where: string) => {
    if (!known.has(id)) problems.push(`${where}: room "${id}" is not on the rooms tab`);
  };

  const seededRooms = new Map<string, SeedRoom>();
  const roomChanges = dataset.rooms.map((seed) => {
    room(seed.id, `rooms[${seed.id}]`);
    if (seededRooms.has(seed.id)) problems.push(`rooms[${seed.id}]: listed twice`);
    seededRooms.set(seed.id, seed);
    const changes: Partial<RoomEdit> = { status: seed.status };
    if (seed.rentRate !== undefined) changes.rentRate = seed.rentRate;
    if (seed.hasMeter !== undefined) changes.hasMeter = seed.hasMeter;
    if (seed.appliances !== undefined) changes.appliances = seed.appliances;
    return { id: seed.id, changes };
  });

  const tenancyRooms = new Set<string>();
  const tenancies = dataset.tenancies.map((seed): PlannedTenancy => {
    const where = `tenancies[${seed.roomId}]`;
    room(seed.roomId, where);
    if (tenancyRooms.has(seed.roomId)) problems.push(`${where}: more than one tenancy for this room`);
    tenancyRooms.add(seed.roomId);
    if (!seed.tenant.fullName?.trim()) problems.push(`${where}: tenant has no name`);
    const { lease } = seed;
    if (!Number.isInteger(lease.occupantCount) || lease.occupantCount < 0) {
      problems.push(`${where}: occupantCount must be a whole number, got ${lease.occupantCount}`);
    }
    for (const field of ['rentRate', 'deposit', 'advanceRent'] as const) {
      if (!(lease[field] >= 0)) problems.push(`${where}: ${field} must be a number ≥ 0`);
    }
    const status = seededRooms.get(seed.roomId)?.status;
    if (status !== undefined && status !== 'occupied' && status !== 'noticeGiven') {
      problems.push(`${where}: room is seeded as "${status}" but has a tenancy`);
    }
    return {
      roomId: seed.roomId,
      tenant: {
        fullName: seed.tenant.fullName.trim(),
        nickname: seed.tenant.nickname ?? '',
        idCardLast4: '',
        address: { ...EMPTY_ADDRESS },
        phone: seed.tenant.phone ?? '',
        occupation: seed.tenant.occupation ?? '',
        evaluationGrade: seed.tenant.evaluationGrade ?? null,
        note: seed.tenant.note ?? '',
      },
      lease: {
        roomId: seed.roomId,
        startDate: date(lease.startDate, `${where}.startDate`),
        endDate: null,
        signedDate: null,
        rentRate: lease.rentRate,
        deposit: lease.deposit,
        advanceRent: lease.advanceRent,
        occupantCount: lease.occupantCount,
        endReason: null,
        previousLeaseId: null,
        moveInDue: lease.moveInDue,
        moveInPaid: lease.moveInPaid,
        moveOutDue: null,
        moveOutPaid: null,
      },
    };
  });

  for (const seed of dataset.rooms) {
    if (seed.status === 'occupied' && !tenancyRooms.has(seed.id)) {
      problems.push(`rooms[${seed.id}]: seeded as occupied but has no tenancy`);
    }
  }

  const readings = dataset.readings.map((seed, index): MeterReadingDraft => {
    const where = `readings[${index}] ${seed.roomId}/${seed.meterType}`;
    room(seed.roomId, where);
    if (seed.currentReading < seed.previousReading) {
      problems.push(`${where}: current ${seed.currentReading} is below previous ${seed.previousReading}`);
    }
    return {
      roomId: seed.roomId,
      meterType: seed.meterType,
      readDate: date(seed.readDate, `${where}.readDate`),
      previousReading: seed.previousReading,
      currentReading: seed.currentReading,
      ratePerUnit: seed.ratePerUnit,
      note: seed.note ?? null,
    };
  });

  const billRooms = new Set<string>();
  const bills = dataset.bills.map((seed): Omit<BillDraft, 'leaseId'> => {
    const where = `bills[${seed.roomId} ${seed.cycle}]`;
    room(seed.roomId, where);
    if (billRooms.has(`${seed.roomId}|${seed.cycle}`)) problems.push(`${where}: billed twice`);
    billRooms.add(`${seed.roomId}|${seed.cycle}`);
    if (seed.rentAmount > 0 && !tenancyRooms.has(seed.roomId)) {
      problems.push(`${where}: charges rent but the room has no tenancy`);
    }
    // The ค่าไฟ on the paper must come back out of its own dial figures.
    const reading = dataset.readings.find(
      (r) =>
        r.roomId === seed.roomId &&
        r.meterType === 'electricity' &&
        r.previousReading === seed.electricityPrevious &&
        r.currentReading === seed.electricityCurrent,
    );
    if (!reading) {
      problems.push(`${where}: no electricity reading matches ${seed.electricityPrevious} → ${seed.electricityCurrent}`);
    } else {
      const expected = (reading.currentReading - reading.previousReading) * reading.ratePerUnit;
      if (expected !== seed.electricityAmount) {
        problems.push(`${where}: ค่าไฟ ${seed.electricityAmount} but the reading works out to ${expected}`);
      }
    }
    return {
      roomId: seed.roomId,
      cycle: seed.cycle,
      issueDate: date(seed.issueDate, `${where}.issueDate`),
      dueDate: date(seed.dueDate, `${where}.dueDate`),
      rentAmount: seed.rentAmount,
      electricityAmount: seed.electricityAmount,
      waterAmount: seed.waterAmount,
      electricityPrevious: seed.electricityPrevious,
      electricityCurrent: seed.electricityCurrent,
      waterQuantity: seed.waterQuantity,
      arrearsNote: seed.arrearsNote,
    };
  });

  const billTotal = bills.reduce(
    (sum, bill) => sum + bill.rentAmount + bill.electricityAmount + bill.waterAmount,
    0,
  );
  if (billTotal !== dataset.expectedBillTotal) {
    problems.push(`bills add up to ${billTotal}, but the report's total is ${dataset.expectedBillTotal}`);
  }

  if (problems.length > 0) throw new SeedDatasetError(problems);
  return { roomChanges, tenancies, readings, bills, billTotal };
}
