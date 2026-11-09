import { describe, expect, it } from 'vitest';
import { insertAt } from './placeholder-insert';

describe('insertAt', () => {
  it('puts the placeholder at the caret and moves the caret after it', () => {
    expect(insertAt('ห้อง  ชั้น', 5, 5, '{ห้อง}')).toEqual({ value: 'ห้อง {ห้อง} ชั้น', caret: 11 });
  });
  it('replaces a selection', () => {
    expect(insertAt('ชื่อ XXX', 5, 8, '{ผู้เช่า}')).toEqual({ value: 'ชื่อ {ผู้เช่า}', caret: 14 });
  });
  it('clamps a stale caret to the end', () => {
    expect(insertAt('abc', 10, 12, '{x}')).toEqual({ value: 'abc{x}', caret: 6 });
  });
});
