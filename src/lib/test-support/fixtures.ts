import type { Bill } from '@/lib/models/bill';
import type { Lease } from '@/lib/models/lease';
import type { MeterReading } from '@/lib/models/meter-reading';
import type { Payment } from '@/lib/models/payment';
import type { Room } from '@/lib/models/room';
import type { Tenant } from '@/lib/models/tenant';
import { EMPTY_ADDRESS } from '@/lib/models/tenant';

/**
 * Fixture builders for tests. Not imported by anything that ships.
 *
 * These exist because the model correction pass added fields to all three
 * entities at once and every test file spelling out a whole literal had to be
 * edited by hand. A builder means the next field lands in one place, and each
 * test states only the fields it is actually about — which also makes the
 * point of a test readable at a glance instead of buried in ten defaults.
 *
 * Defaults are deliberately unremarkable: an occupied, air-conditioned unit,
 * a graded tenant, a running open-ended lease. Anything a test cares about
 * should be overridden explicitly rather than relied on from here.
 */

export function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: '101',
    label: '101',
    floor: 1,
    kind: 'unit',
    status: 'occupied',
    rentRate: 2200,
    hasMeter: true,
    appliances: { tv: null, fridge: null, aircon: true },
    archived: false,
    ...overrides,
  };
}

export function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-001',
    fullName: 'สมชาย ตัวอย่าง',
    nickname: 'ชาย',
    idCardLast4: '1234',
    address: { ...EMPTY_ADDRESS, houseNo: '1/1' },
    phone: '080-000-0001',
    occupation: 'พนักงานบริษัท',
    evaluationGrade: 'A',
    note: '',
    archived: false,
    ...overrides,
  };
}

export function makeLease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: 'l-001',
    roomId: '101',
    tenantId: 't-001',
    startDate: new Date(2025, 0, 1),
    endDate: null,
    signedDate: new Date(2024, 11, 28),
    rentRate: 2200,
    deposit: 5000,
    advanceRent: 2200,
    occupantCount: 1,
    endReason: null,
    previousLeaseId: null,
    moveInDue: null,
    moveInPaid: null,
    moveOutDue: null,
    moveOutPaid: null,
    archived: false,
    ...overrides,
  };
}

/**
 * An unremarkable room electricity read: one cycle, ฿6/unit, no note.
 *
 * The laundry's second meter is the interesting case, so a test that cares
 * about it says `meterType: 'water'` explicitly rather than inheriting it.
 */
export function makeMeterReading(overrides: Partial<MeterReading> = {}): MeterReading {
  return {
    id: 'm-001',
    roomId: '101',
    meterType: 'electricity',
    readDate: new Date(2025, 2, 26),
    previousReading: 1200,
    currentReading: 1256,
    ratePerUnit: 6,
    note: null,
    archived: false,
    ...overrides,
  };
}

/**
 * An ordinary issued bill: room 101's real reconciliation — 2,200 rent + 336
 * ไฟ + 100 น้ำ = 2,636, issued 26 มี.ค., due 10 เม.ย.
 */
export function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'b-001',
    roomId: '101',
    leaseId: 'l-001',
    cycle: '2025-03',
    issueDate: new Date(2025, 2, 26),
    dueDate: new Date(2025, 3, 10),
    rentAmount: 2200,
    electricityAmount: 336,
    waterAmount: 100,
    arrearsNote: null,
    archived: false,
    ...overrides,
  };
}

/**
 * A transfer that settles that bill in full, on the day it was issued.
 *
 * `transfer` is the default because the bill itself prints a bank account to
 * pay into and the collection form is headed รายการโอนเงิน; a test about cash
 * says so.
 */
export function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'p-001',
    billId: 'b-001',
    paidOn: new Date(2025, 2, 26),
    amount: 2636,
    method: 'transfer',
    note: null,
    archived: false,
    ...overrides,
  };
}
