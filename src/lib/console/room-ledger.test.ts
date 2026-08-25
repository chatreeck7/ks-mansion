import { describe, expect, it } from 'vitest';
import { statusLabel, statusTone, type Room } from '@/lib/models/room';
import { makeRoom } from '@/lib/test-support/fixtures';
import { toRoomGroups } from './room-ledger';

const rooms: Room[] = [
  makeRoom({ id: '103', label: '103', rentRate: 2600 }),
  makeRoom({ id: '101', label: '101', rentRate: 2600 }),
  makeRoom({ id: '102', label: '102', rentRate: 2600 }),
  makeRoom({ id: '201', label: '201', floor: 2, rentRate: 2800 }),
  makeRoom({ id: 'laundry', label: 'ร้านซักผ้า', kind: 'common', rentRate: null }),
  makeRoom({
    id: 'undercroft',
    label: 'ห้องใต้ถุน',
    floor: 0,
    kind: 'common',
    status: 'available',
    rentRate: null,
    hasMeter: false,
  }),
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

  it('gives residential units a rent figure and their actual status', () => {
    const row = toRoomGroups(rooms)[0].rows[0];
    expect(row.cells.rate).toEqual({ kind: 'figure', value: 2600 });
    expect(row.cells.status).toEqual({ kind: 'pill', tone: 'ok', label: 'มีผู้เช่า' });
  });

  // Regression: the column used to render a hard-coded 'ว่าง' for every unit,
  // so an occupied building read as entirely vacant. Asserting each row
  // against its own room — rather than that some particular label is absent —
  // is what a literal cannot pass.
  it('gives each row the status of its own room', () => {
    const rowsById = new Map(
      toRoomGroups(rooms)
        .flatMap((group) => group.rows)
        .map((row) => [row.id, row]),
    );
    for (const room of rooms) {
      expect(rowsById.get(room.id)?.cells.status, room.id).toEqual({
        kind: 'pill',
        tone: statusTone(room.status),
        label: statusLabel(room.status),
      });
    }
    // …and the fixture must actually contain more than one status, or the
    // loop above would pass against a constant.
    expect(new Set(rooms.map((r) => r.status)).size).toBeGreaterThan(1);
  });

  it('warns on a room that has given notice', () => {
    const row = toRoomGroups([makeRoom({ status: 'noticeGiven' })])[0].rows[0];
    expect(row.cells.status).toEqual({ kind: 'pill', tone: 'warn', label: 'แจ้งออก' });
  });

  it('gives a common space with no recorded rate an em-dash figure', () => {
    const commonRow = toRoomGroups(rooms).at(-1)!.rows[0];
    expect(commonRow.cells.rate).toEqual({ kind: 'figure', value: null });
  });

  // The group heading already says พื้นที่ส่วนกลาง; the pill spending itself
  // repeating that cost the reader the one fact it could have carried.
  it('shows a common space its real status rather than repeating its kind', () => {
    const commonRow = toRoomGroups(rooms).at(-1)!.rows[0];
    expect(commonRow.cells.status).toEqual({ kind: 'pill', tone: 'ok', label: 'มีผู้เช่า' });
  });

  it('renders a rent figure for a common space that does carry a rate — a laundry can be leased out', () => {
    const rentedLaundry = makeRoom({
      id: 'laundry', label: 'ร้านซักผ้า', kind: 'common', rentRate: 4000,
    });
    const commonRow = toRoomGroups([rentedLaundry]).at(-1)!.rows[0];
    expect(commonRow.cells.rate).toEqual({ kind: 'figure', value: 4000 });
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
