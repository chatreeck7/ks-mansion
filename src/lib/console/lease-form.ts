import type { LeaseDraft } from '@/lib/repositories/lease-repository';

/**
 * Form fields to a `LeaseDraft`.
 *
 * Like the tenant form, this **shapes and does not validate**: the store
 * already refuses to write a row that would not read back, so a rule
 * restated here would be a second copy to keep in step.
 */

/**
 * `<input type="date">` gives `YYYY-MM-DD`, and this builds the date in
 * **local** time from those parts.
 *
 * Not `new Date(value)`, which reads a bare date string as UTC midnight.
 * `formatThaiDate` then reads it back with `getDate()` in local time, so
 * anywhere west of Greenwich the stored date is a day earlier than the one
 * that was typed — and it would be stored in พ.ศ., in a sheet, where nobody
 * would catch it.
 */
export function dateFromInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * The inverse, for pre-filling a date input.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that converts to UTC first
 * and reintroduces the same off-by-one-day the parser above avoids.
 */
export function dateToInput(date: Date | null): string {
  if (!date) return '';

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Blank means "not recorded", which is 0 rather than NaN. */
function numberField(form: FormData, field: string): number {
  const raw = String(form.get(field) ?? '').trim();
  return raw === '' ? 0 : Number(raw);
}

/**
 * The same read where blank must stay **null**, not 0.
 *
 * The move-event amounts distinguish "nobody wrote this down" from "nothing
 * changed hands", and the register uses both: a `-` in จ่ายจริง against a
 * positive ยอดจ่าย is exactly what a tenant absconding looks like.
 */
export function optionalNumberField(form: FormData, field: string): number | null {
  const raw = String(form.get(field) ?? '').trim();
  return raw === '' ? null : Number(raw);
}

export function leaseDraftFromForm(form: FormData): LeaseDraft {
  const text = (field: string): string => String(form.get(field) ?? '').trim();

  return {
    roomId: text('roomId'),
    tenantId: text('tenantId'),
    // An unparseable start date becomes an invalid Date rather than being
    // rejected here: the store formats it, fails to read it back, and says
    // so naming `start_date`. Catching it here would be the second copy of
    // a rule this file exists not to keep.
    startDate: dateFromInput(text('startDate')) ?? new Date(NaN),
    endDate: dateFromInput(text('endDate')),
    signedDate: dateFromInput(text('signedDate')),
    rentRate: numberField(form, 'rentRate'),
    deposit: numberField(form, 'deposit'),
    advanceRent: numberField(form, 'advanceRent'),
    occupantCount: numberField(form, 'occupantCount'),
    // A new lease has not ended, so it has no reason — that is KS-63's, set
    // on the end screen where an end date exists to go with it.
    endReason: null,
    // ย้ายห้อง (KS-64): the tenancy this one continues. Blank is the normal
    // case — most leases start fresh rather than continuing one.
    previousLeaseId: text('previousLeaseId') || null,
    // AC-2.3's move-in half. Blank stays null — "not recorded" rather than
    // "nothing was paid", which are different facts and the register
    // distinguishes them.
    moveInDue: optionalNumberField(form, 'moveInDue'),
    moveInPaid: optionalNumberField(form, 'moveInPaid'),
    // The move-out half belongs to the end screen, where an end date exists
    // to pair it with. A lease being created has not moved out.
    moveOutDue: null,
    moveOutPaid: null,
    coTenantName: text('coTenantName') || null,
    bookingFee: optionalNumberField(form, 'bookingFee'),
    ...moveInTermsFromForm(form),
  };
}

/**
 * The move-in terms from the "เงื่อนไขช่วงเข้าอยู่" box (7 พ.ย. 2569). Shared by
 * the new-lease form and the contract-details form.
 *
 * `billingStart` is one of `move-in` (rent from the day they move in),
 * `next-month` (from the 1st after it) or `custom` (the date typed into
 * `billingStartDate`). `prorate` is `none` or `daily` with `proratePerDay`.
 * Stored as plain fields: a blank billing start means "the move-in day", so
 * nothing changes for a lease written before these terms existed.
 */
export function moveInTermsFromForm(
  form: FormData,
): Pick<LeaseDraft, 'billingStartDate' | 'proratePerDay' | 'startMeter'> {
  const text = (field: string): string => String(form.get(field) ?? '').trim();
  const start = dateFromInput(text('startDate'));
  const mode = text('billingStart');
  let billingStartDate: Date | null = null;
  if (mode === 'next-month' && start) {
    billingStartDate = start.getDate() === 1 ? null : new Date(start.getFullYear(), start.getMonth() + 1, 1);
  } else if (mode === 'custom') {
    billingStartDate = dateFromInput(text('billingStartDate'));
  }
  const daily = text('prorate') === 'daily' ? optionalNumberField(form, 'proratePerDay') : null;
  return {
    billingStartDate,
    proratePerDay: daily && daily > 0 ? daily : null,
    startMeter: optionalNumberField(form, 'startMeter'),
  };
}

/** The move-in box's fields from a lease (or draft), for re-rendering the form. */
export function moveInFormValues(
  lease: Pick<LeaseDraft, 'startDate' | 'billingStartDate' | 'proratePerDay' | 'startMeter'> | null,
  defaultDailyRate: string,
): {
  billingStart: 'move-in' | 'next-month' | 'custom';
  billingStartDate: string;
  prorate: 'none' | 'daily';
  proratePerDay: string;
  startMeter: string;
} {
  const start = lease?.startDate ?? null;
  const billing = lease?.billingStartDate ?? null;
  const nextFirst =
    start && !Number.isNaN(start.getTime()) ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : null;
  const billingStart: 'move-in' | 'next-month' | 'custom' =
    billing === null
      ? 'move-in'
      : nextFirst && billing.getTime() === nextFirst.getTime()
        ? 'next-month'
        : 'custom';
  return {
    billingStart,
    billingStartDate: dateToInput(billing),
    prorate: lease?.proratePerDay ? 'daily' : 'none',
    proratePerDay: lease?.proratePerDay ? String(lease.proratePerDay) : defaultDailyRate,
    startMeter: lease?.startMeter === null || lease?.startMeter === undefined ? '' : String(lease.startMeter),
  };
}
