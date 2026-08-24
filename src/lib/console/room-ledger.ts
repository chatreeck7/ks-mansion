import type { LedgerColumn, LedgerGroup, LedgerRow } from '@/lib/models/ledger';
import { isUnit, type Room } from '@/lib/models/room';
import { consolePath } from './paths';

export const ROOM_COLUMNS: LedgerColumn[] = [
  { key: 'room', header: 'ห้อง' },
  { key: 'rate', header: 'ค่าเช่า', align: 'right' },
  { key: 'status', header: 'สถานะ' },
];

function toRow(room: Room): LedgerRow {
  return {
    id: room.id,
    href: consolePath(`console/rooms/${room.id}`),
    cells: {
      room: { kind: 'text', value: room.label },
      rate: { kind: 'figure', value: room.rentRate },
      status: isUnit(room)
        ? { kind: 'pill', tone: 'info', label: 'ว่าง' }
        : { kind: 'pill', tone: 'mute', label: 'ส่วนกลาง' },
    },
  };
}

/**
 * Residential units grouped by floor in walking order — which is also
 * meter-round order — then common spaces last. Empty floors are omitted
 * rather than shown as empty headings.
 */
export function toRoomGroups(rooms: Room[]): LedgerGroup[] {
  const units = rooms.filter(isUnit);
  const floors = [...new Set(units.map((room) => room.floor))].sort((a, b) => a - b);

  const groups: LedgerGroup[] = floors.map((floor) => ({
    label: `ชั้น ${floor}`,
    rows: units
      .filter((room) => room.floor === floor)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(toRow),
  }));

  const common = rooms.filter((room) => !isUnit(room));
  if (common.length > 0) {
    groups.push({ label: 'พื้นที่ส่วนกลาง', rows: common.map(toRow) });
  }

  return groups;
}
