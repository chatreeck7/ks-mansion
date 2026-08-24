import type { PillTone } from './pill-tone';

/** One cell. The union keeps figure alignment and empty states consistent. */
export type LedgerCell =
  | { kind: 'text'; value: string; muted?: boolean }
  | { kind: 'figure'; value: number | null }
  | { kind: 'pill'; tone: PillTone; label: string };

export interface LedgerColumn {
  key: string;
  header: string;
  align?: 'left' | 'right';
}

export interface LedgerRow {
  id: string;
  /** When present, the row's first cell links here. */
  href?: string;
  cells: Record<string, LedgerCell>;
}

/** Rows under a heading — floors, cycles, whatever the screen groups by. */
export interface LedgerGroup {
  label: string;
  rows: LedgerRow[];
}
