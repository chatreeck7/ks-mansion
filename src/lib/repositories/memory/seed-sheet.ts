import { formatThaiDate } from '@/lib/format/thai';
import { cycleFor, previousCycle } from '@/lib/models/billing-cycle';
import { createInMemorySheets, type InMemorySheets } from './in-memory-sheets';

/**
 * The local-dev spreadsheet: the same tabs `KS_Mansion_DB` carries,
 * as rows rather than as model objects (KS-69).
 *
 * These used to be `Room[]` / `Tenant[]` / `Lease[]` behind a hand-written
 * memory store that validated nothing. That store was supposed to match the
 * Sheets one and did not: a tenant with a full 13-digit national ID saved
 * cleanly here and threw only in production. Expressing the seeds as rows
 * means local dev runs the *real* repository — the same parser, the same
 * refusal to write a row that could not be read back — so the two agree by
 * construction instead of by being kept in step by hand.
 *
 * The cost is that a seed which does not satisfy the contract now fails
 * loudly at startup rather than working locally and breaking on deploy. That
 * is the point of the change, not a side effect of it.
 *
 * Headers below are the contract from `docs/sheet-schema.md`. Column *order*
 * is irrelevant — everything resolves by name — but keeping it in the
 * documented order makes this readable next to the doc.
 */

/** Dates as the console itself writes them: พ.ศ. text, via the same formatter. */
function thaiDate(year: number, month: number, day: number): string {
  return formatThaiDate(new Date(year, month - 1, day));
}

// ---------------------------------------------------------------- rooms

/**
 * Real per-room **rent**, reconciled against ใบแจ้งค่าห้องพัก and the current
 * `KS_Mansion_DB`.
 *
 * These replace the figures seeded from the `ค่าห้องฯ` column of
 * แบบฟอร์มเก็บเงินค่าห้อง, which turned out to be a month's *total* bill, not
 * rent — room 101's 2,636 was 2,200 rent + 336 ไฟ + 100 น้ำ. Every value here
 * is the rent alone.
 */
const RENT_RATE: Record<string, number> = {
  '101': 2200, '102': 3000, '103': 2500, '104': 3000, '105': 2500,
  '201': 2300, '202': 2500, '203': 2500, '204': 3000, '205': 2200,
  '206': 2500, '207': 3000, '208': 2500, '209': 2500, '210': 2500,
  '301': 2800, '302': 3000, '303': 2800, '304': 3000, '305': 3000,
  '306': 3000, '307': 2500, '308': 3000, '309': 2500, '310': 2300,
};

/** Rooms currently out of service; every other unit is occupied. */
const UNDER_MAINTENANCE = new Set(['104', '204', '209']);

/**
 * Rooms with a fan instead of an air conditioner, per the sheet's `type`
 * column — the one appliance fact the source data actually records today.
 *
 * TV and fridge are left **blank**, which reads back as `null`: genuinely
 * "not on file", because nothing records them yet. That is the honest value,
 * and it is why the model carries three states rather than two.
 */
const FAN_ONLY = new Set(['102', '103', '306', '307', '308', '309', '310']);

const ROOMS_HEADER = [
  'id', 'room_number', 'kind', 'status', 'rent_rate', 'detail',
  'floor', 'hasMeter', 'has_tv', 'has_fridge', 'has_aircon', 'archived',
];

/**
 * A lettable unit. `detail` is empty so the label falls back to the room
 * number, which for a unit already *is* the name people use.
 */
function unitRow(roomNumber: string, floor: number): (string | number)[] {
  return [
    roomNumber,
    roomNumber,
    'unit',
    UNDER_MAINTENANCE.has(roomNumber) ? 'maintenance' : 'occupied',
    RENT_RATE[roomNumber] ?? '',
    '',
    floor,
    'TRUE',
    '',
    '',
    FAN_ONLY.has(roomNumber) ? 'FALSE' : 'TRUE',
    '',
  ];
}

function numbered(prefix: string, count: number, floor: number): (string | number)[][] {
  return Array.from({ length: count }, (_, i) =>
    unitRow(`${prefix}${String(i + 1).padStart(2, '0')}`, floor),
  );
}

/**
 * The registry from KS-7: 101–105, 201–210, 301–310, plus two common spaces.
 * The undercroft has no sub-meter; the laundry does and is actually rented
 * out (the split is lettable-vs-common, not rented-vs-not).
 *
 * The undercroft's label and floor deliberately differ from the live sheet
 * (`ห้องเช่าส่วนกลาง`, floor 1). That difference is the tell: if the console
 * shows `ห้องใต้ถุน`, it is running on this seed rather than reading Sheets.
 * `/console/health` now says so outright, but the tell is worth keeping.
 */
const ROOM_ROWS: (string | number)[][] = [
  ...numbered('1', 5, 1),
  ...numbered('2', 10, 2),
  ...numbered('3', 10, 3),
  ['laundry', 'laundry', 'common', 'occupied', 1800, 'ร้านซักผ้า', 1, 'TRUE', '', '', 'FALSE', ''],
  ['undercroft', 'undercroft', 'common', 'available', '', 'ห้องใต้ถุน', 0, 'FALSE', '', '', 'FALSE', ''],
];

// -------------------------------------------------------------- tenants

const TENANTS_HEADER = [
  'id', 'full_name', 'nickname', 'id_card_last4', 'phone',
  'occupation', 'evaluation_grade', 'note',
  'address_house_no', 'address_road', 'address_subdistrict',
  'address_district', 'address_province', 'address_postcode', 'archived',
];

/**
 * Deliberately **fictional** people, unlike the room seed which carries real
 * rents. Tenant records are personal data; checking real names, addresses and
 * phone numbers into the repository would defeat the point of keeping even
 * the ID card down to four digits.
 *
 * The three profiles differ on purpose — a graded tenant with a full address,
 * an ungraded one with a sparse address and a note, and one with almost
 * nothing on file — so the detail screen's empty states are visible locally
 * without editing the seed.
 */
const TENANT_ROWS: string[][] = [
  ['t-001', 'สมชาย ตัวอย่าง', 'ชาย', '1234', '080-000-0001',
   'พนักงานบริษัท', 'A', '',
   '1/1', 'ตัวอย่าง', 'ในเมือง', 'เมือง', 'ตัวอย่าง', '10000', ''],

  ['t-002', 'สมหญิง ตัวอย่าง', '', '5678', '080-000-0002',
   'ค้าขาย', '', '(เลี้ยงแมว)',
   '2', '', '', '', 'ตัวอย่าง', '', ''],

  ['t-003', 'สมศักดิ์ ตัวอย่าง', 'ศักดิ์', '9012', '',
   '', 'C', '',
   '', '', '', '', '', '', ''],

  // Rents ร้านซักผ้า. Exists so the water screen (KS-19) has a metered row
  // locally — without a tenancy on the laundry, the one space billed by
  // meter rather than by headcount is invisible until production.
  ['t-004', 'สมปอง ตัวอย่าง', 'ปอง', '3456', '080-000-0004',
   'ร้านซักรีด', 'B', '',
   '4', '', '', '', 'ตัวอย่าง', '', ''],
];

/**
 * The rooms that are occupied but have no hand-written tenancy above.
 *
 * The seed used to mark 22 units occupied while supplying five leases, which
 * was harmless until a bill run asked every occupied room for its rent and
 * found twenty with no tenancy behind them. A registry that says a room is
 * occupied and a lease table that disagrees is not a shape production would
 * ever be in, so local dev should not be in it either.
 */
const UNTENANTED: string[] = Object.keys(RENT_RATE)
  .filter((room) => !UNDER_MAINTENANCE.has(room))
  .filter((room) => room !== '101' && room !== '105')
  .sort();

// --------------------------------------------------------------- leases

const LEASES_HEADER = [
  'id', 'room_id', 'tenant_id', 'start_date', 'end_date', 'signed_date',
  'rent_rate', 'deposit', 'advance_rent', 'occupant_count',
  'end_reason', 'previous_lease_id', 'archived',
  'move_in_due', 'move_in_paid', 'move_out_due', 'move_out_paid',
];

/**
 * Fictional, and keyed to the fictional tenants above.
 *
 * Covers the shapes worth being able to see locally: an open-ended tenancy,
 * a fixed term that ended normally, one that ended with the tenant absconding
 * (หนี — common enough in the real log to be a normal outcome), and a room
 * transfer, where `previous_lease_id` keeps one tenancy from reading as two
 * shorter ones.
 *
 * Rents match the corrected per-room rates above — rent alone, never a
 * month's total.
 */
const LEASE_ROWS: (string | number)[][] = [
  ['l-001', '101', 't-001',
   thaiDate(2025, 1, 1), '', thaiDate(2024, 12, 28),
   2200, 5000, 2200, 2, '', '', '', 7400, 7400, '', ''],

  ['l-002', '102', 't-002',
   thaiDate(2025, 3, 1), thaiDate(2026, 2, 28), thaiDate(2025, 2, 25),
   3000, 9000, 3000, 1, 'normal', '', '', 12000, 12000, -1432, -1432],

  ['l-003', '103', 't-003',
   thaiDate(2023, 1, 1), thaiDate(2023, 12, 31), thaiDate(2022, 12, 20),
   2500, 6000, 2500, 1, 'absconded', '', '', 8500, 8500, 1894, 0],

  // t-002 moved 102 → 105 rather than leaving; one tenancy, two rooms.
  ['l-004', '105', 't-002',
   thaiDate(2026, 3, 1), '', thaiDate(2026, 2, 20),
   2500, 9000, 2500, 1, '', 'l-002', '', 2500, 2500, '', ''],

  // The shop. `occupant_count` is 0 and that is correct rather than missing:
  // nobody lives there, and its water comes off a meter, not a headcount.
  ['l-005', 'laundry', 't-004',
   thaiDate(2025, 6, 1), '', thaiDate(2025, 5, 25),
   1800, 5000, 1800, 0, '', '', '', 6800, 6800, '', ''],

  // The matching tenancies. Open-ended and started well in the past, so they
  // are active whenever the seed is loaded. Occupant counts alternate between
  // one and two, which is what the real sheet's ค่าน้ำ column only ever shows.
  ...UNTENANTED.map((room, i) => [
    `l-${String(i + 6).padStart(3, '0')}`, room, `t-${String(i + 5).padStart(3, '0')}`,
    thaiDate(2025, 2, 1), '', thaiDate(2025, 1, 20),
    RENT_RATE[room] ?? 2500, 5000, RENT_RATE[room] ?? 2500, (i % 2) + 1,
    '', '', '', '', '', '', '',
  ]),
];

// ------------------------------------------------------- meter_readings

const METER_READINGS_HEADER = [
  'id', 'room_id', 'meter_type', 'read_date', 'previous_reading',
  'current_reading', 'rate_per_unit', 'note', 'archived',
];

/**
 * Two cycles of readings (KS-18), dated **relative to today**.
 *
 * They used to be fixed 2568 dates, which was fine until a bill run asked
 * whether the current cycle had been read and the answer was "not for a
 * year". A seed whose usefulness expires is a seed that quietly stops
 * demonstrating the thing it exists to demonstrate.
 *
 * Three things stay visible on purpose:
 *
 * **ร้านซักผ้า is read twice per round** — electricity at ฿5 and water at
 * ฿15, the pair the source file encodes inline as `4215//786` → `4343//816`.
 * Any round or bill that assumes one meter per space comes out visibly wrong
 * here rather than only in production.
 *
 * **A correction is an appended row.** 102's current-cycle reading was keyed
 * once and re-read on the sweep. Both rows stay; the later one wins.
 *
 * **An archived row is one that should never have existed** — a reading
 * entered against 104, which is out of service.
 */
const THIS_CYCLE = cycleFor(new Date());
const LAST_CYCLE = previousCycle(THIS_CYCLE);

/** Rooms are electricity-only at ฿6; ค่าน้ำ for a unit is occupants × 100. */
const ROOM_RATE = 6;

/** A plausible month of consumption, varied per room but not random. */
function usageFor(room: string, cycle: number): number {
  const seed = [...room].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return 40 + ((seed + cycle * 17) % 60);
}

function meterRows(): (string | number)[][] {
  const rows: (string | number)[][] = [];
  let n = 0;
  const id = () => `m-${String(++n).padStart(3, '0')}`;

  // A room out of service is not walked, which is what leaves 104 carrying
  // nothing but the archived mis-entry below.
  const metered = Object.keys(RENT_RATE)
    .filter((room) => !UNDER_MAINTENANCE.has(room))
    .sort();

  for (const [cycleIndex, cycle] of [LAST_CYCLE, THIS_CYCLE].entries()) {
    const readDate = formatThaiDate(cycle.issueDate);

    for (const room of metered) {
      // A dial that has been running for years, so the figures look like a
      // meter rather than like a counter starting at zero.
      const base = 1000 + usageFor(room, 0) * 8;
      const previous = base + (cycleIndex === 0 ? 0 : usageFor(room, 0));
      rows.push([id(), room, 'electricity', readDate, previous,
                 previous + usageFor(room, cycleIndex), ROOM_RATE, '', '']);
    }

    const laundryElectricity = cycleIndex === 0 ? [4215, 4343] : [4343, 4470];
    const laundryWater = cycleIndex === 0 ? [786, 816] : [816, 851];
    rows.push([id(), 'laundry', 'electricity', readDate, ...laundryElectricity, 5, '', '']);
    rows.push([id(), 'laundry', 'water', readDate, ...laundryWater, 15, '', '']);
  }

  // 102 re-read on this cycle's sweep: both rows stay, the later one wins.
  const corrected = rows.find(
    (row) => row[1] === '102' && row[3] === formatThaiDate(THIS_CYCLE.issueDate),
  )!;
  rows.push([id(), '102', 'electricity', formatThaiDate(THIS_CYCLE.issueDate),
             corrected[4]!, Number(corrected[5]) + 90, ROOM_RATE, 'เก็บตก — เลขเดิมจดผิด', '']);

  // Entered against the wrong room, so withdrawn rather than corrected.
  rows.push([id(), '104', 'electricity', formatThaiDate(THIS_CYCLE.issueDate),
             0, 0, ROOM_RATE, 'บันทึกผิดห้อง', 'TRUE']);

  return rows;
}

const METER_READING_ROWS: (string | number)[][] = meterRows();

// ----------------------------------------------------------------- bills

const BILLS_HEADER = [
  'id', 'room_id', 'lease_id', 'cycle', 'issue_date', 'due_date',
  'rent_amount', 'electricity_amount', 'water_amount', 'total_amount',
  'arrears_note', 'archived',
];

/**
 * One issued cycle, shaped to show the three cases a bill can be.
 *
 * Cycle `2025-03` — read and issued 26 มี.ค., due 10 เม.ย. Electricity comes
 * from that round's readings; water is จำนวนผู้พัก × 100 for a room, metered
 * for ร้านซักผ้า.
 *
 * `total_amount` is written out because the tab is summed by people, but the
 * reader checks it against the parts rather than trusting it — these three
 * rows are what proves that check passes on well-formed data.
 */
const BILL_ROWS: (string | number)[][] = [
  // 101: an ordinary room. 1312 − 1256 = 56 units at ฿6, two occupants.
  ['b-001', '101', 'l-001', '2025-03', thaiDate(2025, 3, 26), thaiDate(2025, 4, 10),
   2200, 336, 200, 2736, '', ''],

  // 102: an arrears note an admin wrote, in the register's own wording.
  // The note changes no figure and is not part of the total.
  ['b-002', '102', 'l-002', '2025-03', thaiDate(2025, 3, 26), thaiDate(2025, 4, 10),
   3000, 606, 100, 3706, 'ยอดค้าง 1,169', ''],

  // ร้านซักผ้า: metered water at ฿15, and its own electricity rate of ฿5.
  ['b-003', 'laundry', 'l-005', '2025-03', thaiDate(2025, 3, 26), thaiDate(2025, 4, 10),
   1800, 635, 525, 2960, '', ''],
];

// ---------------------------------------------------------------- build

/**
 * A fresh seed spreadsheet. Each call builds its own, so a test can write
 * into one without reaching another.
 */
export function createSeedSheets(): InMemorySheets {
  return createInMemorySheets({
    rooms: [ROOMS_HEADER, ...ROOM_ROWS],
    tenants: [TENANTS_HEADER, ...TENANT_ROWS],
    leases: [LEASES_HEADER, ...LEASE_ROWS],
    meter_readings: [METER_READINGS_HEADER, ...METER_READING_ROWS],
    bills: [BILLS_HEADER, ...BILL_ROWS],
  });
}

/**
 * The one the app uses, shared across requests.
 *
 * Writes have to persist for the life of the process or a create-then-view
 * flow cannot work locally — that is what makes the console usable with no
 * Google account. They are gone on restart, which is what keeps it a fixture
 * rather than a database.
 *
 * Built lazily so that merely importing the composition root does not
 * construct it, and so a test that never touches the seed pays nothing.
 */
let shared: InMemorySheets | null = null;

export function sharedSeedSheets(): InMemorySheets {
  shared ??= createSeedSheets();
  return shared;
}
