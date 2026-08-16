import { describe, expect, it } from 'vitest';
import type { Room } from '@/lib/models/room';
import { toRoomGroups } from './room-ledger';

const rooms: Room[] = [
  { id: '103', label: '103', floor: 1, kind: 'unit', rentRate: 2600, hasMeter: true },
  { id: '101', label: '101', floor: 1, kind: 'unit', rentRate: 2600, hasMeter: true },
  { id: '102', label: '102', floor: 1, kind: 'unit', rentRate: 2600, hasMeter: true },
  { id: '201', label: '201', floor: 2, kind: 'unit', rentRate: 2800, hasMeter: true },
  { id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common', rentRate: null, hasMeter: true },
  { id: 'undercroft', label: 'ห้องใต้ถุน', floor: 0, kind: 'common', rentRate: null, hasMeter: false },
];

describe('toRoomGroups', () => {
  it('groups residential units by floor, in walking order', () => {
    const groups = toRoomGroups(rooms);
    expect(groups[0].label).toBe('ชั้น 1');
    expect(groups[1].label).toBe('ชั้น 2');
  });

  it('puts common spaces in their own group, last', () => {
    const groups = toRoomGroups(rooms);
    expect(groups.at(-1)?.label).toBe('พื้นที่ส่วนกลาง');
    expect(groups.at(-1)?.rows).toHaveLength(2);
  });

  it('gives residential units a rent figure and a vacancy pill', () => {
    const row = toRoomGroups(rooms)[0].rows[0];
    expect(row.cells.rate).toEqual({ kind: 'figure', value: 2600 });
    expect(row.cells.status).toEqual({ kind: 'pill', tone: 'info', label: 'ว่าง' });
  });

  it('gives a common space with no recorded rate an em-dash figure and a muted pill', () => {
    const commonRow = toRoomGroups(rooms).at(-1)!.rows[0];
    expect(commonRow.cells.rate).toEqual({ kind: 'figure', value: null });
    expect(commonRow.cells.status).toEqual({ kind: 'pill', tone: 'mute', label: 'ส่วนกลาง' });
  });

  it('renders a rent figure for a common space that does carry a rate — a laundry can be leased out', () => {
    const rentedLaundry: Room = {
      id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common', rentRate: 4000, hasMeter: true,
    };
    const commonRow = toRoomGroups([rentedLaundry]).at(-1)!.rows[0];
    expect(commonRow.cells.rate).toEqual({ kind: 'figure', value: 4000 });
    expect(commonRow.cells.status).toEqual({ kind: 'pill', tone: 'mute', label: 'ส่วนกลาง' });
  });

  it('gives a common-space row a room cell and a link to its detail page, same as a unit row', () => {
    const commonRow = toRoomGroups(rooms).at(-1)!.rows[0];
    expect(commonRow.cells.room).toEqual({ kind: 'text', value: 'ร้านซักผ้า' });
    expect(commonRow.href?.endsWith('/console/rooms/laundry')).toBe(true);
  });

  it('links every row to its detail page', () => {
    const href = toRoomGroups(rooms)[0].rows[0].href!;
    expect(href.endsWith('/console/rooms/101')).toBe(true);
    expect(href).not.toMatch(/\/\//);
  });

  it('omits an empty floor group entirely', () => {
    // 101 (floor 1, unit) + the two common spaces, deliberately excluding
    // the floor-2 room — no unit remains on floor 2, so its group must not
    // appear.
    const groups = toRoomGroups([rooms[1], rooms[4], rooms[5]]);
    expect(groups.map((g) => g.label)).toEqual(['ชั้น 1', 'พื้นที่ส่วนกลาง']);
  });

  it('sorts rooms within a floor into walking order', () => {
    const groups = toRoomGroups(rooms);
    expect(groups[0].rows.map((row) => row.id)).toEqual(['101', '102', '103']);
  });
});
