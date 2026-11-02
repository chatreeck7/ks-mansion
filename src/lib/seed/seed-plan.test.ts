import { describe, expect, it } from 'vitest';
import { planSeed, SeedDatasetError, type SeedDataset } from './seed-plan';

/** A two-room month, invented — real tenant data never lives in the repo. */
function dataset(overrides: Partial<SeedDataset> = {}): SeedDataset {
  return {
    label: 'ตัวอย่าง',
    expectedBillTotal: 2685,
    rooms: [
      { id: '101', status: 'occupied', appliances: { tv: false, fridge: true, aircon: null } },
      { id: '102', status: 'available' },
    ],
    tenancies: [
      {
        roomId: '101',
        tenant: { fullName: 'ผู้เช่าห้อง 101 (รอชื่อ)', phone: '090-000-0000', evaluationGrade: 'A' },
        lease: {
          startDate: '29/3/2566',
          rentRate: 2200,
          deposit: 0,
          advanceRent: 0,
          occupantCount: 1,
          moveInDue: null,
          moveInPaid: null,
        },
      },
    ],
    readings: [
      {
        roomId: '101',
        meterType: 'electricity',
        readDate: '27/10/2569',
        previousReading: 12047,
        currentReading: 12102,
        ratePerUnit: 7,
      },
    ],
    bills: [
      {
        roomId: '101',
        cycle: '2026-10',
        issueDate: '28/10/2569',
        dueDate: '10/11/2569',
        rentAmount: 2200,
        electricityAmount: 385,
        waterAmount: 100,
        electricityPrevious: 12047,
        electricityCurrent: 12102,
        waterQuantity: 1,
        arrearsNote: null,
      },
    ],
    ...overrides,
  };
}

const ROOMS = ['101', '102', 'laundry'];

describe('planSeed', () => {
  it('turns a consistent month into repository drafts', () => {
    const plan = planSeed(dataset(), ROOMS);

    expect(plan.billTotal).toBe(2685);
    expect(plan.roomChanges).toEqual([
      { id: '101', changes: { status: 'occupied', appliances: { tv: false, fridge: true, aircon: null } } },
      { id: '102', changes: { status: 'available' } },
    ]);
    expect(plan.tenancies[0]!.tenant).toMatchObject({
      fullName: 'ผู้เช่าห้อง 101 (รอชื่อ)',
      idCardLast4: '',
      evaluationGrade: 'A',
    });
    // Buddhist-era paperwork dates become ordinary dates.
    expect(plan.tenancies[0]!.lease.startDate).toEqual(new Date(2023, 2, 29));
    expect(plan.bills[0]!.issueDate).toEqual(new Date(2026, 9, 28));
    expect(plan.readings[0]!.readDate).toEqual(new Date(2026, 9, 27));
  });

  it('refuses a bill whose ค่าไฟ does not come back out of its reading', () => {
    const bad = dataset();
    bad.bills[0]!.electricityAmount = 358;
    bad.expectedBillTotal = 2658;

    expect(() => planSeed(bad, ROOMS)).toThrow(/ค่าไฟ 358 but the reading works out to 385/);
  });

  it("refuses bills that do not add up to the report's total", () => {
    expect(() => planSeed(dataset({ expectedBillTotal: 2700 }), ROOMS)).toThrow(
      /add up to 2685, but the report's total is 2700/,
    );
  });

  it('names every problem at once, not one per run', () => {
    const bad = dataset({ expectedBillTotal: 1 });
    bad.tenancies[0]!.lease.startDate = '56/7/2569';
    bad.readings[0]!.roomId = '999';

    try {
      planSeed(bad, ROOMS);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SeedDatasetError);
      const { problems } = error as SeedDatasetError;
      expect(problems.some((p) => p.includes('"56/7/2569" is not a date'))).toBe(true);
      expect(problems.some((p) => p.includes('room "999" is not on the rooms tab'))).toBe(true);
      expect(problems.some((p) => p.includes("report's total is 1"))).toBe(true);
    }
  });

  it('refuses an occupied room with no tenancy, and a tenancy in a vacant room', () => {
    expect(() =>
      planSeed(dataset({ rooms: [{ id: '101', status: 'available' }, { id: '102', status: 'occupied' }] }), ROOMS),
    ).toThrow(SeedDatasetError);

    try {
      planSeed(dataset({ rooms: [{ id: '101', status: 'available' }, { id: '102', status: 'occupied' }] }), ROOMS);
    } catch (error) {
      const { problems } = error as SeedDatasetError;
      expect(problems).toContain('tenancies[101]: room is seeded as "available" but has a tenancy');
      expect(problems).toContain('rooms[102]: seeded as occupied but has no tenancy');
    }
  });
});
