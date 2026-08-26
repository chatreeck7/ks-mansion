import { describe, expect, it } from 'vitest';
import { makeRoom } from '@/lib/test-support/fixtures';
import { chargesRent, isTenanted, isUnit, statusLabel, statusTone, type RoomStatus } from './room';

const unit = makeRoom({ rentRate: 2800 });
const laundry = makeRoom({
  id: 'laundry',
  label: 'ร้านซักผ้า',
  kind: 'common',
  rentRate: null,
  appliances: { tv: false, fridge: false, aircon: false },
});

describe('isUnit', () => {
  it('is true for a residential unit', () => {
    expect(isUnit(unit)).toBe(true);
  });

  it('is false for a common space', () => {
    expect(isUnit(laundry)).toBe(false);
  });
});

describe('rentRate', () => {
  it('may be recorded on a common space — a laundry or undercroft can be rented out', () => {
    expect(makeRoom({ ...laundry, rentRate: 4000 }).rentRate).toBe(4000);
  });
});

describe('isTenanted', () => {
  it('counts a room that has given notice — someone still lives there', () => {
    expect(isTenanted(makeRoom({ status: 'noticeGiven' }))).toBe(true);
  });

  it('is true while occupied', () => {
    expect(isTenanted(makeRoom({ status: 'occupied' }))).toBe(true);
  });

  it.each<RoomStatus>(['available', 'maintenance'])('is false when %s', (status) => {
    expect(isTenanted(makeRoom({ status }))).toBe(false);
  });
});

describe('chargesRent', () => {
  it('is true only while occupied', () => {
    expect(chargesRent(makeRoom({ status: 'occupied' }))).toBe(true);
  });

  // The `Utility` case in รายการค่าไฟและค่าห้อง: a room under notice is still
  // billed for water and electricity, but no rent. Collapsing this into
  // isTenanted would re-bill rent for a room that has already given notice.
  it('is false once notice is given, even though the room is still tenanted', () => {
    const noticeGiven = makeRoom({ status: 'noticeGiven' });
    expect(isTenanted(noticeGiven)).toBe(true);
    expect(chargesRent(noticeGiven)).toBe(false);
  });

  it.each<RoomStatus>(['available', 'maintenance'])('is false when %s', (status) => {
    expect(chargesRent(makeRoom({ status }))).toBe(false);
  });
});

describe('statusLabel and statusTone', () => {
  const statuses: RoomStatus[] = ['occupied', 'noticeGiven', 'available', 'maintenance'];

  it('gives every status a Thai label', () => {
    expect(statuses.map(statusLabel)).toEqual(['มีผู้เช่า', 'แจ้งออก', 'ว่าง', 'ปรับปรุง']);
  });

  it('warns only for แจ้งออก — the one status carrying a deadline', () => {
    expect(statuses.filter((s) => statusTone(s) === 'warn')).toEqual(['noticeGiven']);
  });
});
