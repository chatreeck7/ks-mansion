import type { TileState } from './building';

/**
 * How each room state looks as a window in the building view. Shared by the
 * tile itself and the legend under it, so the key always matches the picture.
 *
 * Every state differs in more than colour — fill, border style and the mark
 * all change — so the building still reads in greyscale or on a photocopy.
 */
export const TILE_CLASS: Record<TileState, string> = {
  paid: 'border-2 border-console-ok bg-console-ok text-white',
  partial: 'border-2 border-console-crit bg-console-card text-console-ink',
  unpaid: 'border-2 border-console-ink bg-console-card text-console-ink',
  unbilled: 'border-2 border-dashed border-console-ink/50 bg-console-card text-console-ink',
  missing: 'border-2 border-dashed border-console-crit bg-console-crit-bg text-console-crit',
  vacant: 'border-2 border-console-line-strong bg-console-spine text-console-ink-soft',
  reno: 'border-2 border-console-line-strong bg-console-hatch text-console-ink-soft',
  common: 'border-2 border-console-line-strong bg-console-spine text-console-ink-soft',
};

/** Legend order: the states that ask something of you first. */
export const TILE_LEGEND: { state: TileState; label: string }[] = [
  { state: 'paid', label: 'จ่ายแล้ว' },
  { state: 'unpaid', label: 'ออกบิลแล้ว รอจ่าย' },
  { state: 'partial', label: 'จ่ายบางส่วน' },
  { state: 'unbilled', label: 'ยังไม่ออกบิล' },
  { state: 'missing', label: 'ไม่มีข้อมูลสัญญา' },
  { state: 'vacant', label: 'ว่าง / ส่วนกลาง' },
  { state: 'reno', label: 'ปรับปรุง ไม่ออกบิล' },
];
