import { cycleFor, cycleLabel } from '@/lib/models/billing-cycle';
import { meterTypeLabel, type MeterReadingDraft } from '@/lib/models/meter-reading';
import type { LedgerColumn, LedgerGroup, LedgerRow } from '@/lib/models/ledger';
import type { Round, RoundStop } from './meter-round';
import { previewEntry } from './meter-round-view';

/**
 * The desk-side register for the same round the phone walks (KS-60).
 *
 * The stepper is right for walking the building and wrong for fixing a typo
 * in 207: one stop at a time is what you want with a torch in the other hand,
 * and exactly what you do not want when you already know which figure is
 * wrong. This is the same stop list rendered as one table you tab down.
 *
 * **A correction here is an appended reading, not an edit.** There is no
 * `updateReading` to call — `meter_readings` is append-only (schema rule 6),
 * so a corrected figure becomes a new row and the bill that was issued from
 * the old one stays reconstructable. What the grid actually offers is a fast
 * way to record many readings at once, whether that is a whole cycle or one
 * fix.
 */

export const METER_GRID_COLUMNS: LedgerColumn[] = [
  { key: 'room', header: 'ห้อง' },
  { key: 'meter', header: 'มิเตอร์' },
  { key: 'previous', header: 'ครั้งก่อน', align: 'right' },
  { key: 'current', header: 'เลขล่าสุด', align: 'right' },
  { key: 'rate', header: 'บาท/หน่วย', align: 'right' },
];

/**
 * Field names carry the meter, not a row number.
 *
 * A positional name would repeat the mistake `findRow` exists to prevent one
 * layer up: the grid re-reads the registry on POST, and a room archived
 * between render and submit would shift every index below it, landing each
 * reading on the wrong meter.
 */
export function fieldName(stop: RoundStop, field: 'current' | 'previous' | 'rate'): string {
  return `${field}:${stop.key}`;
}

/** Values typed into one row, as they came back from the form. */
export interface SubmittedRow {
  current: string;
  previous: string;
  rate: string;
}

/** Just enough of `FormData` to read a grid back, so tests need no DOM. */
export interface SubmittedForm {
  get(name: string): FormDataEntryValue | null;
}

function field(form: SubmittedForm, stop: RoundStop, name: 'current' | 'previous' | 'rate'): string {
  const value = form.get(fieldName(stop, name));
  return typeof value === 'string' ? value.trim() : '';
}

export function submittedRow(form: SubmittedForm, stop: RoundStop): SubmittedRow {
  return {
    current: field(form, stop, 'current'),
    previous: field(form, stop, 'previous'),
    rate: field(form, stop, 'rate'),
  };
}

/**
 * The grid as a ledger, with an input where a figure would normally sit.
 *
 * `submitted` puts back what was typed when a POST comes back with errors —
 * otherwise a single bad row would clear 26 good ones and the correction
 * would have to be re-typed from memory.
 *
 * `saved` is the other half of that, and the reason this is not simply "put
 * everything back": a partial save leaves some rows written and some
 * rejected, and a written row that keeps its figure invites a second submit
 * that appends the same reading again — recorded, this time, as zero units
 * against itself. Rows named here render empty however they were submitted.
 */
export function toMeterGridGroups(
  round: Round,
  cycleDate: Date,
  submitted?: SubmittedForm,
  saved: ReadonlySet<string> = new Set(),
): LedgerGroup[] {
  const rows: LedgerRow[] = round.stops.map((stop): LedgerRow => {
    const typed =
      submitted && !saved.has(stop.key)
        ? submittedRow(submitted, stop)
        : { current: '', previous: '', rate: '' };
    const where = `${stop.roomLabel} ${meterTypeLabel(stop.meterType)}`;

    return {
      id: stop.key,
      cells: {
        room: { kind: 'text', value: stop.roomLabel },
        meter: { kind: 'text', value: meterTypeLabel(stop.meterType), muted: true },
        // A meter with no history needs its starting figure typed too. On the
        // building's first round that is every row, not an odd one.
        previous:
          stop.previousReading === null
            ? {
                kind: 'input',
                name: fieldName(stop, 'previous'),
                value: typed.previous,
                label: `เลขครั้งก่อน ${where}`,
              }
            : { kind: 'figure', value: stop.previousReading },
        current: {
          kind: 'input',
          name: fieldName(stop, 'current'),
          value: typed.current,
          label: `เลขล่าสุด ${where}`,
        },
        rate:
          stop.ratePerUnit === null
            ? {
                kind: 'input',
                name: fieldName(stop, 'rate'),
                value: typed.rate,
                label: `บาทต่อหน่วย ${where}`,
              }
            : { kind: 'figure', value: stop.ratePerUnit },
      },
    };
  });

  // Named by the collection cycle the reading falls in, not by today's
  // date: a round walked on the 25th and finished on the 26th is one round,
  // and two different day labels would say otherwise.
  return [{ label: cycleLabel(cycleFor(cycleDate)), rows }];
}

/** A row that parsed, and the stop it came from. */
export interface GridEntry {
  /** Carried so the page can clear exactly the rows it managed to save. */
  stopKey: string;
  draft: MeterReadingDraft;
}

export interface GridSubmission {
  /** One per row that was filled in. Rows left blank produce nothing. */
  entries: GridEntry[];
  /** Rows that were filled in but do not add up, named by room. */
  errors: string[];
}

/**
 * Turns a submitted grid into readings to record.
 *
 * **A blank row is not an error.** The common use is correcting one meter out
 * of 27, so leaving the rest empty is the normal way to use this screen —
 * treating a blank as a missing value would make the ordinary case fail.
 *
 * Validation is `previewEntry`, the same function the phone stepper shows
 * live, which in turn restates what the repository refuses on write. One rule,
 * three places it can be seen, no chance of the desk accepting what the
 * stairwell would not.
 */
export function draftsFromForm(
  round: Round,
  form: SubmittedForm,
  readDate: Date,
): GridSubmission {
  const entries: GridEntry[] = [];
  const errors: string[] = [];

  for (const stop of round.stops) {
    const typed = submittedRow(form, stop);
    if (typed.current === '') continue;

    const preview = previewEntry(stop, {
      currentReading: typed.current,
      previousReading: typed.previous,
      ratePerUnit: typed.rate,
    });

    if (preview.status !== 'ok') {
      const reason = preview.status === 'invalid' ? preview.message : 'กรอกไม่ครบ';
      errors.push(`${stop.roomLabel} (${meterTypeLabel(stop.meterType)}): ${reason}`);
      continue;
    }

    entries.push({
      stopKey: stop.key,
      draft: {
        roomId: stop.roomId,
        meterType: stop.meterType,
        readDate,
        previousReading: preview.previousReading!,
        currentReading: preview.currentReading,
        ratePerUnit: preview.ratePerUnit!,
        note: null,
      },
    });
  }

  return { entries, errors };
}
