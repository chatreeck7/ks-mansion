import { billTotal, type Bill } from '@/lib/models/bill';
import type { LedgerColumn, LedgerGroup, LedgerRow } from '@/lib/models/ledger';

/**
 * ค้าง on an issued bill (KS-22).
 *
 * **Free text, never inferred.** The console does not decide someone is in
 * arrears by comparing payments to bills — an admin asserts it. The source
 * document proves why that matters: its `หมายเหตุ` column carries both
 * `ยอดค้าง 4,327` and `ค้างประกัน 1,000`, and those are *different facts* —
 * unpaid rent against an unpaid deposit. A typed amount would have to pick
 * one and would be wrong about the other; only a person knows which this is.
 *
 * It is also the one field writable after a bill is issued, which is not a
 * hole in the append-only rule: the note changes no charge and no total. See
 * `BillRepository`.
 */

export const ARREARS_COLUMNS: LedgerColumn[] = [
  { key: 'room', header: 'ห้อง' },
  { key: 'total', header: 'ยอดบิล', align: 'right' },
  { key: 'note', header: 'หมายเหตุ / ยอดค้าง' },
];

export function arrearsFieldName(bill: Bill): string {
  return `arrears:${bill.id}`;
}

/** Just enough of `FormData` to read the notes back without a DOM. */
export interface SubmittedNotes {
  get(name: string): FormDataEntryValue | null;
}

export function toArrearsGroups(
  bills: Bill[],
  label: string,
  submitted?: SubmittedNotes,
): LedgerGroup[] {
  const rows: LedgerRow[] = bills.map((bill): LedgerRow => {
    const typed = submitted?.get(arrearsFieldName(bill));

    return {
      id: bill.id,
      cells: {
        room: { kind: 'text', value: bill.roomId },
        total: { kind: 'figure', value: billTotal(bill) },
        note: {
          kind: 'input',
          name: arrearsFieldName(bill),
          value: typeof typed === 'string' ? typed : (bill.arrearsNote ?? ''),
          label: `หมายเหตุ ห้อง ${bill.roomId}`,
          // The two shapes the real sheet actually holds, offered as a hint
          // rather than as options — the admin writes the sentence.
          placeholder: 'เช่น ยอดค้าง 1,169 หรือ ค้างประกัน 1,000',
        },
      },
    };
  });

  return [{ label, rows }];
}

export interface ArrearsUpdate {
  billId: string;
  note: string | null;
}

/**
 * The notes that actually changed.
 *
 * **A blank clears the note**, unlike the occupant count on the water screen
 * where blank is an error. The difference is what a blank means: an occupant
 * count is always true of a room, so an empty one is a fact someone deleted;
 * a note is only there while it applies, so emptying it is how an admin says
 * the ค้าง is settled.
 *
 * Unchanged rows produce nothing. This screen is opened to annotate one or
 * two rooms out of a cycle, and rewriting twenty-three untouched bills would
 * be twenty-three sheet round trips recording no new fact.
 */
export function arrearsUpdatesFromForm(bills: Bill[], form: SubmittedNotes): ArrearsUpdate[] {
  const updates: ArrearsUpdate[] = [];

  for (const bill of bills) {
    const raw = form.get(arrearsFieldName(bill));
    if (typeof raw !== 'string') continue;

    const note = raw.trim() || null;
    if (note !== bill.arrearsNote) updates.push({ billId: bill.id, note });
  }

  return updates;
}
