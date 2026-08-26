import { describe, expect, it } from 'vitest';
import { formatThaiDate } from '@/lib/format/thai';
import { dateFromInput, dateToInput, leaseDraftFromForm } from './lease-form';

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

describe('dateFromInput', () => {
  it('reads YYYY-MM-DD as those calendar parts', () => {
    const date = dateFromInput('2026-08-26')!;

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(26);
  });

  /**
   * `new Date('2026-08-26')` is UTC midnight, and `formatThaiDate` reads it
   * back with local-time getters — so west of Greenwich the sheet would
   * record the day before the one that was typed, in พ.ศ., where nobody
   * would catch it. Building from parts keeps the round trip exact.
   */
  it('round-trips through the Thai formatter without shifting a day', () => {
    expect(formatThaiDate(dateFromInput('2026-08-26')!)).toBe('26 ส.ค. 2569');
    expect(formatThaiDate(dateFromInput('2026-01-01')!)).toBe('1 ม.ค. 2569');
    expect(formatThaiDate(dateFromInput('2025-12-31')!)).toBe('31 ธ.ค. 2568');
  });

  it('rejects anything that is not a full date', () => {
    expect(dateFromInput('')).toBeNull();
    expect(dateFromInput('2026-08')).toBeNull();
    expect(dateFromInput('26/08/2026')).toBeNull();
  });
});

describe('dateToInput', () => {
  it('round-trips with dateFromInput', () => {
    expect(dateToInput(dateFromInput('2026-08-26'))).toBe('2026-08-26');
    expect(dateToInput(dateFromInput('2026-01-05'))).toBe('2026-01-05');
  });

  it('is blank for a lease with no end date', () => {
    expect(dateToInput(null)).toBe('');
  });

  /** Zero-padded, or the browser silently ignores the value. */
  it('pads month and day', () => {
    expect(dateToInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('leaseDraftFromForm', () => {
  it('maps the fields the form posts', () => {
    const draft = leaseDraftFromForm(
      formOf({
        roomId: 'r-101',
        tenantId: 't-001',
        startDate: '2026-03-01',
        endDate: '2027-02-28',
        signedDate: '2026-02-20',
        rentRate: '2200',
        deposit: '4400',
        advanceRent: '2200',
        occupantCount: '2',
      }),
    );

    expect(draft.roomId).toBe('r-101');
    expect(draft.tenantId).toBe('t-001');
    expect(formatThaiDate(draft.startDate)).toBe('1 มี.ค. 2569');
    expect(formatThaiDate(draft.endDate!)).toBe('28 ก.พ. 2570');
    expect(formatThaiDate(draft.signedDate!)).toBe('20 ก.พ. 2569');
    expect(draft.rentRate).toBe(2200);
    expect(draft.deposit).toBe(4400);
    expect(draft.advanceRent).toBe(2200);
    expect(draft.occupantCount).toBe(2);
  });

  it('leaves an open-ended tenancy open', () => {
    const draft = leaseDraftFromForm(formOf({ startDate: '2026-03-01', endDate: '' }));
    expect(draft.endDate).toBeNull();
  });

  /**
   * KS-63 owns the end reason and KS-64 the transfer link. A lease that
   * starts with either set would be shipping half of a card that has its own
   * decisions still to make.
   */
  it('never sets an end reason or a previous lease on create', () => {
    const draft = leaseDraftFromForm(
      formOf({ startDate: '2026-03-01', endReason: 'absconded', previousLeaseId: 'l-001' }),
    );

    expect(draft.endReason).toBeNull();
    expect(draft.previousLeaseId).toBeNull();
  });

  it('reads a blank money field as zero rather than NaN', () => {
    const draft = leaseDraftFromForm(formOf({ startDate: '2026-03-01', deposit: '' }));
    expect(draft.deposit).toBe(0);
  });

  /** The store names `start_date` when it cannot read this back. */
  it('passes an unparseable start date through as an invalid date', () => {
    const draft = leaseDraftFromForm(formOf({ startDate: 'ไม่ใช่วันที่' }));
    expect(Number.isNaN(draft.startDate.getTime())).toBe(true);
  });
});
