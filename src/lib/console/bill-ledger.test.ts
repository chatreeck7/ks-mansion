import { describe, expect, it } from 'vitest';
import { shortProblem } from './bill-ledger';

describe('shortProblem', () => {
  it('says the reason in a word — the card above says the rest', () => {
    expect(shortProblem('เลขมิเตอร์ล่าสุด (27 ต.ค. 2569) ออกบิลไปแล้ว — ยังไม่ได้จดรอบใหม่')).toBe('รอจดมิเตอร์');
    expect(shortProblem('ยังไม่ได้จดมิเตอร์ไฟ')).toBe('รอจดมิเตอร์');
    expect(shortProblem('คิดค่าน้ำไม่ได้ — ไม่มีสัญญาเช่าหรือยังไม่ได้จดมิเตอร์น้ำ')).toBe('รอข้อมูลค่าน้ำ');
    expect(shortProblem('ห้องมีผู้เช่าแต่ไม่มีสัญญาเช่า')).toBe('ไม่มีสัญญาเช่า');
  });
});
