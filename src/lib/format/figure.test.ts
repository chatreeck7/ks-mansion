import { describe, expect, it } from 'vitest';
import { figureProblems, parseFigure, sanitizeFigure, westernDigits } from './figure';

describe('parseFigure', () => {
  it('reads plain, separated and decimal figures', () => {
    expect(parseFigure('2636')).toBe(2636);
    expect(parseFigure(' 2,636 ')).toBe(2636);
    expect(parseFigure('1,169.50')).toBe(1169.5);
  });

  it('keeps blank as null, apart from junk', () => {
    expect(parseFigure('')).toBeNull();
    expect(parseFigure(null)).toBeNull();
    for (const junk of ['abc', '2,6e6', '0x1F', 'Infinity', '+5', '-3', '12a', '1,23']) {
      expect(parseFigure(junk)).toBeNaN();
    }
  });

  it('reads Thai digits', () => {
    expect(westernDigits('๒,๖๓๖')).toBe('2,636');
    expect(parseFigure('๓๕๐๐')).toBe(3500);
  });
});

describe('figureProblems', () => {
  it('names every field that is not a figure', () => {
    const form = new FormData();
    form.set('rentRate', '3,500');
    form.set('deposit', 'สามพัน');
    form.set('advanceRent', 'x');
    expect(figureProblems(form, { rentRate: 'ค่าเช่า', deposit: 'เงินประกัน', advanceRent: 'ค่าเช่าล่วงหน้า', bookingFee: 'ค่ามัดจำ' }))
      .toBe('เงินประกัน, ค่าเช่าล่วงหน้า ต้องเป็นตัวเลขเท่านั้น');
    form.set('deposit', '7000');
    form.set('advanceRent', '');
    expect(figureProblems(form, { rentRate: 'ค่าเช่า', deposit: 'เงินประกัน', advanceRent: 'ค่าเช่าล่วงหน้า' })).toBeNull();
  });
});

describe('sanitizeFigure', () => {
  it('drops what each kind of field does not take', () => {
    expect(sanitizeFigure('12a3', 'integer')).toBe('123');
    expect(sanitizeFigure('1,2.3.4บาท', 'decimal')).toBe('1,2.34');
    expect(sanitizeFigure('08x1-234 5678', 'tel')).toBe('081-234 5678');
    expect(sanitizeFigure('๑๒๓', 'integer')).toBe('123');
  });
});
