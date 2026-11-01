import { describe, expect, it } from 'vitest';
import { makeLease, makeRoom, makeTenant } from '@/lib/test-support/fixtures';
import { evaluationReportFor, monthsBetween } from './evaluation-report';

const asOf = new Date(2026, 9, 26);

describe('evaluationReportFor', () => {
  const rooms = [
    makeRoom({ id: '201', label: '201', floor: 2 }),
    makeRoom({ id: '101', label: '101', floor: 1 }),
    makeRoom({ id: '102', label: '102', floor: 1 }),
  ];
  const tenants = [
    makeTenant({ id: 't-1', evaluationGrade: 'A', occupation: 'เทศบาลนคร', phone: '093' }),
    makeTenant({ id: 't-2', evaluationGrade: null }),
  ];
  const leases = [
    makeLease({ id: 'l-1', roomId: '101', tenantId: 't-1', occupantCount: 2, startDate: new Date(2026, 4, 5) }),
    makeLease({ id: 'l-2', roomId: '201', tenantId: 't-2', occupantCount: 1, startDate: new Date(2007, 11, 29) }),
    // Ended: room 102 is vacant on the day.
    makeLease({ id: 'l-3', roomId: '102', tenantId: 't-2', startDate: new Date(2025, 0, 1), endDate: new Date(2026, 8, 30) }),
  ];
  const report = evaluationReportFor(rooms, leases, tenants, asOf);

  it('lists every room in walking order, vacant ones blank', () => {
    expect(report.rows.map((r) => [r.roomLabel, r.occupants, r.grade, r.occupation])).toEqual([
      ['101', 2, 'A', 'เทศบาลนคร'],
      ['102', null, null, ''],
      ['201', 1, null, 'พนักงานบริษัท'],
    ]);
  });

  it('counts grades over tenanted rooms only, with "not assessed" as its own bar', () => {
    expect(report.grades).toEqual({ A: 1, B: 0, C: 0, none: 1 });
  });

  it('counts rooms and people per floor', () => {
    expect(report.floors).toEqual([
      { floor: 1, occupied: 1, vacant: 1, occupants: 2 },
      { floor: 2, occupied: 1, vacant: 0, occupants: 1 },
    ]);
    expect(report).toMatchObject({ occupiedRooms: 2, totalRooms: 3, totalOccupants: 3 });
  });

  it('bands how long current tenants have stayed', () => {
    expect(report.tenure.map((b) => b.count)).toEqual([1, 0, 0, 0, 1]);
  });
});

describe('monthsBetween', () => {
  it('counts whole months, not started ones', () => {
    expect(monthsBetween(new Date(2026, 4, 30), new Date(2026, 9, 26))).toBe(4);
    expect(monthsBetween(new Date(2026, 4, 5), new Date(2026, 9, 26))).toBe(5);
  });
});
