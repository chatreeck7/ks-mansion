/**
 * The meter round's PIN-style keypad, as a pure function of (typed, key).
 *
 * The round is done one-handed in a stairwell, so the phone's own keyboard is
 * replaced by a large 3×4 pad — the same shape as entering a PIN, which every
 * admin already does without looking. Pure so the rules are tested without a
 * DOM: one decimal point (dials carry fractions), no leading zeros, and a cap
 * so a stuck thumb cannot type a figure no meter in the building can show.
 */

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';

/** Longest figure the pad accepts — 7 digits plus a point and two decimals. */
export const MAX_LENGTH = 10;

export function pressKey(typed: string, key: PadKey): string {
  if (key === 'back') return typed.slice(0, -1);
  if (key === '.') {
    if (typed.includes('.')) return typed;
    return typed === '' ? '0.' : typed + '.';
  }
  if (typed.length >= MAX_LENGTH) return typed;
  // "0" then "7" is 7, not 07 — a dial never reads with a leading zero.
  if (typed === '0') return key;
  return typed + key;
}

/** Maps a physical key, for anyone using the round with a keyboard. */
export function padKeyFrom(eventKey: string): PadKey | null {
  if (/^[0-9]$/.test(eventKey)) return eventKey as PadKey;
  if (eventKey === '.' || eventKey === ',') return '.';
  if (eventKey === 'Backspace') return 'back';
  return null;
}
