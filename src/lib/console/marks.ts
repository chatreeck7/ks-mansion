/**
 * The logbook's marks: ✓ ○ ? — (and ½), the same everywhere.
 *
 * A mark is the console's whole status vocabulary. Every screen that says
 * whether something is done uses one of these, with the same glyph, colour
 * and meaning, so an admin learns them once:
 *
 * - ✓ done
 * - ○ not yet — the normal state of work in progress, not a problem
 * - ? missing data — something has to be filled in before work can continue.
 *   Always drawn with a dashed red border, so it reads without colour too.
 * - — not needed — deliberately nothing to do (a room under repair)
 * - ½ part-done, with something blocking the rest
 */

export type MarkKind = 'done' | 'todo' | 'missing' | 'none' | 'partial';

export interface MarkSpec {
  glyph: string;
  /** Spoken label, for screen readers and the legend. */
  label: string;
  /** Text colour class. */
  text: string;
}

export const MARKS: Record<MarkKind, MarkSpec> = {
  done: { glyph: '✓', label: 'เสร็จแล้ว', text: 'text-console-ok' },
  todo: { glyph: '○', label: 'ยังไม่เสร็จ', text: 'text-console-ink' },
  missing: { glyph: '?', label: 'ขาดข้อมูล', text: 'text-console-crit' },
  none: { glyph: '—', label: 'ไม่ต้องทำ', text: 'text-console-ink-soft' },
  partial: { glyph: '½', label: 'ทำไปบางส่วน', text: 'text-console-crit' },
};

/** Done / not-done / part-done from two counts. */
export function markFromCounts(done: number, total: number, blocked = 0): MarkKind {
  if (total === 0) return 'none';
  if (done >= total && blocked === 0) return 'done';
  if (done > 0) return 'partial';
  return 'todo';
}
