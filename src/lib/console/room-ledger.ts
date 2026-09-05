import type { LedgerColumn, LedgerGroup, LedgerRow } from '@/lib/models/ledger';
import { inWalkingOrder, isUnit, statusLabel, statusTone, type Room } from '@/lib/models/room';
import { consolePath } from './paths';

export const ROOM_COLUMNS: LedgerColumn[] = [
  { key: 'room', header: 'ห้อง' },
  { key: 'rate', header: 'ค่าเช่า', align: 'right' },
  { key: 'status', header: 'สถานะ' },
];

/**
 * The status pill shows the room's actual state. It previously showed a
 * hard-coded 'ว่าง' for every unit — the model had no status to read, so the
 * column asserted every room was vacant regardless. Common spaces no longer
 * get a 'ส่วนกลาง' pill either: the group heading already says that, and the
 * cell is more useful carrying the same state as everything else.
 */
function toRow(room: Room): LedgerRow {
  return {
    id: room.id,
    href: consolePath(`console/rooms/${room.id}`),
    cells: {
      room: { kind: 'text', value: room.label },
      rate: { kind: 'figure', value: room.rentRate },
      status: { kind: 'pill', tone: statusTone(room.status), label: statusLabel(room.status) },
    },
  };
}

/**
 * Residential units grouped by floor in walking order — which is also
 * meter-round order — then common spaces last. Empty floors are omitted
 * rather than shown as empty headings.
 */
export function toRoomGroups(rooms: Room[]): LedgerGroup[] {
  // The sequence itself is `inWalkingOrder`, shared with the meter round.
  // This function only decides where the floor headings fall in it.
  const ordered = inWalkingOrder(rooms);
  const units = ordered.filter(isUnit);
  const floors = [...new Set(units.map((room) => room.floor))];

  const groups: LedgerGroup[] = floors.map((floor) => ({
    label: `ชั้น ${floor}`,
    rows: units.filter((room) => room.floor === floor).map(toRow),
  }));

  const common = ordered.filter((room) => !isUnit(room));
  if (common.length > 0) {
    groups.push({ label: 'พื้นที่ส่วนกลาง', rows: common.map(toRow) });
  }

  return groups;
}
