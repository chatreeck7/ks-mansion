import { THAI_MONTHS_FULL, THAI_MONTHS_SHORT, toBuddhistYear } from '@/lib/format/thai';
import { billTotal, type Bill } from '@/lib/models/bill';
import { isReadingDay, type BillingCycle } from '@/lib/models/billing-cycle';
import { activeLeaseFor, type Lease } from '@/lib/models/lease';
import { unitsUsed, type MeterReading, type MeterType } from '@/lib/models/meter-reading';
import { inWalkingOrder, statusLabel, type Room } from '@/lib/models/room';

/**
 * สรุปรายการค่าไฟฟ้า and สรุปรายการค่าห้องพัก — the two sheets the family
 * files with the monthly report ("ตาม FILE แนบ รายการค่าไฟ-ค่าห้อง").
 *
 * Both are read straight off what the console already holds — the round's
 * readings and the issued bills — so the paper and the screen cannot
 * disagree. Grouped by floor with a รวมเงิน under each, as the paper is;
 * the ground-level spaces (ร้านซักผ้า, ห้องใต้ถุน, office) print with ชั้นที่ 1,
 * which is where the family's sheet has always put them.
 */

/** `ต.ค.69` — how the family's own titles write a month. */
export function shortMonthYear(date: Date): string {
  return `${THAI_MONTHS_SHORT[date.getMonth()]}${String(toBuddhistYear(date.getFullYear())).slice(2)}`;
}

/** Floors 0 and 1 print together, as on paper. */
function printedFloor(room: Pick<Room, 'floor'> | undefined): number {
  return room === undefined ? 1 : Math.max(1, room.floor);
}

// -------------------------------------------------------------- electricity

export interface MeterLine {
  previous: number;
  current: number;
  units: number;
  rate: number;
  amount: number;
}

export interface ElectricityRow {
  roomId: string;
  label: string;
  /** Null when the room has a meter and nothing was read this round. */
  readDate: Date | null;
  electricity: MeterLine | null;
  /** ร้านซักผ้า's water meter, printed as its own ค่าน้ำ line beneath. */
  water: MeterLine | null;
}

export interface ElectricityFloor {
  floor: number;
  rows: ElectricityRow[];
  /** ไฟ + น้ำมิเตอร์, the paper's รวมเงิน under each floor. */
  subtotal: number;
}

export interface ElectricitySummary {
  title: string;
  floors: ElectricityFloor[];
  total: number;
  units: number;
  /** Metered rooms with no reading this round — named rather than hidden. */
  unread: string[];
}

function lineOf(reading: MeterReading): MeterLine {
  const units = unitsUsed(reading);
  return {
    previous: reading.previousReading,
    current: reading.currentReading,
    units,
    rate: reading.ratePerUnit,
    amount: units * reading.ratePerUnit,
  };
}

/** The newest live reading per room and meter inside the cycle's month. */
function roundReadings(cycle: BillingCycle, readings: readonly MeterReading[]): Map<string, MeterReading> {
  const latest = new Map<string, MeterReading>();
  for (const reading of readings) {
    if (reading.archived || !isReadingDay(cycle, reading.readDate)) continue;
    const key = `${reading.roomId}|${reading.meterType}`;
    const seen = latest.get(key);
    if (!seen || reading.readDate.getTime() >= seen.readDate.getTime()) latest.set(key, reading);
  }
  return latest;
}

export function electricitySummaryFor(
  cycle: BillingCycle,
  rooms: readonly Room[],
  readings: readonly MeterReading[],
): ElectricitySummary {
  const round = roundReadings(cycle, readings);
  const get = (roomId: string, type: MeterType) => round.get(`${roomId}|${type}`) ?? null;
  const live = inWalkingOrder(rooms.filter((room) => !room.archived));
  const known = new Set(live.map((room) => room.id));

  const rows: Array<ElectricityRow & { floor: number }> = [];
  const unread: string[] = [];
  for (const room of live) {
    const electricity = get(room.id, 'electricity');
    const water = get(room.id, 'water');
    if (!room.hasMeter && !electricity && !water) continue;
    if (room.hasMeter && !electricity) unread.push(room.label);
    rows.push({
      roomId: room.id,
      label: room.label,
      floor: printedFloor(room),
      readDate: (electricity ?? water)?.readDate ?? null,
      electricity: electricity ? lineOf(electricity) : null,
      water: water ? lineOf(water) : null,
    });
  }
  // A dial read for a space that is not on the rooms tab (an office, the
  // pump) still costs money the building pays — list it rather than drop it.
  for (const reading of round.values()) {
    if (known.has(reading.roomId) || reading.meterType !== 'electricity') continue;
    const water = get(reading.roomId, 'water');
    rows.push({
      roomId: reading.roomId,
      label: reading.roomId,
      floor: 1,
      readDate: reading.readDate,
      electricity: lineOf(reading),
      water: water ? lineOf(water) : null,
    });
  }

  const floors = new Map<number, ElectricityFloor>();
  for (const { floor, ...row } of rows) {
    const group = floors.get(floor) ?? { floor, rows: [], subtotal: 0 };
    group.rows.push(row);
    group.subtotal += (row.electricity?.amount ?? 0) + (row.water?.amount ?? 0);
    floors.set(floor, group);
  }
  const ordered = [...floors.values()].sort((a, b) => a.floor - b.floor);

  return {
    title: `สรุปรายการค่าไฟฟ้าห้องพัก เดือน ${fullMonthYear(cycle.utilityMonth)}`,
    floors: ordered,
    total: ordered.reduce((sum, floor) => sum + floor.subtotal, 0),
    units: rows.reduce((sum, row) => sum + (row.electricity?.units ?? 0), 0),
    unread,
  };
}

function fullMonthYear(date: Date): string {
  return `${THAI_MONTHS_FULL[date.getMonth()]} ${toBuddhistYear(date.getFullYear())}`;
}

// -------------------------------------------------------------------- rooms

export interface RoomSummaryRow {
  roomId: string;
  label: string;
  /** วันที่เข้าอยู่ of the tenancy billed, or of the one living there now. */
  movedIn: Date | null;
  /** Null when no bill was issued for the room this cycle. */
  rent: number | null;
  water: number | null;
  electricity: number | null;
  total: number | null;
  tv: boolean;
  fridge: boolean;
  aircon: boolean;
  /** สถานะ: ว่าง / แจ้งออก / ปรับปรุง, plus the bill's ยอดค้าง note. */
  note: string;
}

export interface RoomSummaryTotals {
  rent: number;
  water: number;
  electricity: number;
  total: number;
  tv: number;
  fridge: number;
  aircon: number;
  billed: number;
}

export interface RoomSummaryFloor {
  floor: number;
  rows: RoomSummaryRow[];
  totals: RoomSummaryTotals;
}

export interface RoomSummary {
  title: string;
  /** `[เก็บค่าเช่าของ พ.ย.69, ค่าน้ำค่าไฟของ ต.ค.69]`. */
  subtitle: string;
  floors: RoomSummaryFloor[];
  totals: RoomSummaryTotals;
  vacant: number;
}

function emptyTotals(): RoomSummaryTotals {
  return { rent: 0, water: 0, electricity: 0, total: 0, tv: 0, fridge: 0, aircon: 0, billed: 0 };
}

function add(into: RoomSummaryTotals, row: RoomSummaryRow): void {
  into.rent += row.rent ?? 0;
  into.water += row.water ?? 0;
  into.electricity += row.electricity ?? 0;
  into.total += row.total ?? 0;
  into.tv += row.tv ? 1 : 0;
  into.fridge += row.fridge ? 1 : 0;
  into.aircon += row.aircon ? 1 : 0;
  into.billed += row.total === null ? 0 : 1;
}

export function roomSummaryFor(
  cycle: BillingCycle,
  rooms: readonly Room[],
  leases: readonly Lease[],
  bills: readonly Bill[],
): RoomSummary {
  const billByRoom = new Map<string, Bill>();
  for (const bill of bills) {
    if (!bill.archived && bill.cycle === cycle.id) billByRoom.set(bill.roomId, bill);
  }
  const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
  const live = inWalkingOrder(rooms.filter((room) => !room.archived));

  const floors = new Map<number, RoomSummaryFloor>();
  const totals = emptyTotals();
  let vacant = 0;
  for (const room of live) {
    const bill = billByRoom.get(room.id) ?? null;
    const lease =
      (bill?.leaseId ? leaseById.get(bill.leaseId) : undefined) ??
      activeLeaseFor(
        leases.filter((l) => l.roomId === room.id && !l.archived),
        cycle.issueDate,
      );
    const notes: string[] = [];
    if (room.status !== 'occupied') notes.push(statusLabel(room.status));
    if (bill?.arrearsNote?.trim()) notes.push(bill.arrearsNote.trim());
    if (room.status === 'available') vacant += 1;

    const row: RoomSummaryRow = {
      roomId: room.id,
      label: room.label,
      movedIn: lease?.startDate ?? null,
      rent: bill ? bill.rentAmount : null,
      water: bill ? bill.waterAmount : null,
      electricity: bill ? bill.electricityAmount : null,
      total: bill ? billTotal(bill) : null,
      tv: room.appliances.tv === true,
      fridge: room.appliances.fridge === true,
      aircon: room.appliances.aircon === true,
      note: notes.join(' · '),
    };
    const floor = printedFloor(room);
    const group = floors.get(floor) ?? { floor, rows: [], totals: emptyTotals() };
    group.rows.push(row);
    add(group.totals, row);
    add(totals, row);
    floors.set(floor, group);
  }

  return {
    title: `สรุปรายการค่าห้องพัก ณ สิ้นเดือน ${shortMonthYear(cycle.utilityMonth)}`,
    subtitle: `เก็บค่าเช่าของ ${shortMonthYear(cycle.rentMonth)}, ค่าน้ำค่าไฟของ ${shortMonthYear(cycle.utilityMonth)}`,
    floors: [...floors.values()].sort((a, b) => a.floor - b.floor),
    totals,
    vacant,
  };
}

/** `25/10/69` — the register's own way of writing a date. */
export function shortThaiDate(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}/${String(toBuddhistYear(date.getFullYear())).slice(2)}`;
}
