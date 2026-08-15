import { describe, expect, it } from 'vitest';
import type { Room } from '@/lib/models/room';
import { toRoomGroups } from './room-ledger';

const rooms: Room[] = [
  { id: '101', label: '101', floor: 1, kind: 'lettable', rentRate: 2600, hasMeter: true },
  { id: '201', label: '201', floor: 2, kind: 'lettable', rentRate: 2800, hasMeter: true },
  { id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common', hasMeter: true },
  { id: 'undercroft', label: 'ห้องใต้ถุน', floor: 0, kind: 'common', hasMeter: false },
];

describe('toRoomGroups', () => {
  it('groups lettable units by floor, in walking order', () => {
    const groups = toRoomGroups(rooms);
    expect(groups[0].label).toBe('ชั้น 1');
    expect(groups[1].label).toBe('ชั้น 2');
  });

  it('puts common spaces in their own group, last', () => {
    const groups = toRoomGroups(rooms);
    expect(groups.at(-1)?.label).toBe('พื้นที่ส่วนกลาง');
    expect(groups.at(-1)?.rows).toHaveLength(2);
  });

  it('gives lettable units a rent figure and a vacancy pill', () => {
    const row = toRoomGroups(rooms)[0].rows[0];
    expect(row.cells.rate).toEqual({ kind: 'figure', value: 2600 });
    expect(row.cells.status).toEqual({ kind: 'pill', tone: 'info', label: 'ว่าง' });
  });

  it('gives common spaces an explicit no-rent label and a muted pill', () => {
    const commonRow = toRoomGroups(rooms).at(-1)!.rows[0];
    expect(commonRow.cells.rate).toEqual({ kind: 'text', value: 'ไม่คิดค่าเช่า', muted: true });
    expect(commonRow.cells.status).toEqual({ kind: 'pill', tone: 'mute', label: 'ส่วนกลาง' });
  });

  it('links every row to its detail page', () => {
    const href = toRoomGroups(rooms)[0].rows[0].href!;
    expect(href.endsWith('/console/rooms/101')).toBe(true);
    expect(href).not.toMatch(/\/\//);
  });

  it('omits an empty floor group entirely', () => {
    const groups = toRoomGroups([rooms[0], rooms[2], rooms[3]]);
    expect(groups.map((g) => g.label)).toEqual(['ชั้น 1', 'พื้นที่ส่วนกลาง']);
  });
});
