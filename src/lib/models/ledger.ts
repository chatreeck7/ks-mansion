import type { PillTone } from './pill-tone';

/** One cell. The union keeps figure alignment and empty states consistent. */
export type LedgerCell =
  | { kind: 'text'; value: string; muted?: boolean }
  | { kind: 'figure'; value: number | null }
  | { kind: 'pill'; tone: PillTone; label: string }
  | LedgerInputCell;

/**
 * An editable figure, for a ledger the admin types into rather than reads.
 *
 * KS-58 left this off the union on purpose — deciding the shape with no
 * consumer would have been guessing. KS-60's meter correction grid is that
 * consumer: same table, same alignment, different input register.
 *
 * There is no `onChange` and no island. The table sits inside an ordinary
 * `<form>`, so tabbing down a column and submitting the lot is native
 * behaviour rather than something JavaScript has to reimplement — which is
 * exactly what "tab down the rooms, correct a reading, save" asks for.
 */
export interface LedgerInputCell {
  kind: 'input';
  /** Field name, and how the submitted value is found again. */
  name: string;
  value: string;
  /**
   * The accessible name. A column header alone does not identify a cell in a
   * grid of 27 identical inputs — a screen reader needs to say which room.
   */
  label: string;
  placeholder?: string;
  /**
   * What is typed here. Figures are the common case and stay the default;
   * `text` exists because a note is not a number and a phone offering a
   * numeric keypad for `ค้างประกัน 1,000` is offering the wrong keyboard.
   */
  mode?: 'figure' | 'text';
}

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
