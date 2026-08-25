/**
 * Soft delete, per docs/sheet-schema.md rule 7.
 *
 * Records are never removed from the sheet. A hard delete in a shared,
 * human-editable spreadsheet is unrecoverable in practice — there is no trash
 * to restore a row from the way there is for a whole file — and a tenant or
 * lease that stops existing also takes its history with it, which the
 * length-of-stay analytics (AC-5.2) depend on.
 *
 * The flag lives on the model rather than only inside the repository so a
 * screen that deliberately shows an archived record can say so. Repositories
 * still exclude archived records from their list methods, so a screen has to
 * opt in rather than remember to filter.
 */
export interface Archivable {
  archived: boolean;
}

export function isArchived(record: Archivable): boolean {
  return record.archived;
}

/** The sheet column every entity tab carries for rule 7. */
export const ARCHIVED_COLUMN = 'archived';
