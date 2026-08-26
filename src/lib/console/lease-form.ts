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
  };
}
