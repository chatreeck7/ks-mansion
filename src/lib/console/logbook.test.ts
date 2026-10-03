import { describe, expect, it } from 'vitest';
import { cycleFor } from '@/lib/models/billing-cycle';
import { daysUntilDue, dueLabel, notebookTitle, shortCycleLabel, todayLabel } from './logbook';

const today = new Date(2026, 9, 3); // Sat 3 Oct 2026
const cycle = cycleFor(today); // issued 26 Sep 2026

describe('logbook words', () => {
  it('names the notebook after the month whose utilities are billed', () => {
    expect(notebookTitle(cycle)).toBe('สมุดเดือนกันยายน 2569');
  });

  it('prints the collection window with the year once', () => {
    expect(shortCycleLabel(cycle)).toBe('รอบ 26 ก.ย. – 10 ต.ค. 2569');
  });

  it('counts days to the due date', () => {
    expect(daysUntilDue(cycle, today)).toBe(7);
    expect(dueLabel(cycle, today)).toBe('ครบกำหนดชำระ 10 ต.ค. (อีก 7 วัน)');
    expect(dueLabel(cycle, new Date(2026, 9, 12))).toContain('เลยมา 2 วัน');
  });

  it('names today with its weekday', () => {
    expect(todayLabel(today)).toBe('วันเสาร์ 3 ต.ค.');
  });
});
