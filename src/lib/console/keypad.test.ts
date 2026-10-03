import { describe, expect, it } from 'vitest';
import { MAX_LENGTH, padKeyFrom, pressKey } from './keypad';

const type = (keys: string[]) => keys.reduce((s, k) => pressKey(s, k as never), '');

describe('pressKey', () => {
  it('appends digits', () => {
    expect(type(['1', '3', '2', '6'])).toBe('1326');
  });

  it('deletes the last character', () => {
    expect(type(['1', '3', 'back'])).toBe('1');
    expect(pressKey('', 'back')).toBe('');
  });

  it('allows one decimal point, and starts a bare point at 0.', () => {
    expect(type(['1', '.', '5', '.'])).toBe('1.5');
    expect(type(['.', '5'])).toBe('0.5');
  });

  it('drops a leading zero', () => {
    expect(type(['0', '7'])).toBe('7');
  });

  it('stops at the length cap', () => {
    expect(type(Array(MAX_LENGTH + 3).fill('9'))).toHaveLength(MAX_LENGTH);
  });
});

describe('padKeyFrom', () => {
  it('maps digits, the point and backspace; ignores the rest', () => {
    expect(padKeyFrom('4')).toBe('4');
    expect(padKeyFrom(',')).toBe('.');
    expect(padKeyFrom('Backspace')).toBe('back');
    expect(padKeyFrom('a')).toBeNull();
  });
});
