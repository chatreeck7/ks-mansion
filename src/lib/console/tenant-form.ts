import type { EvaluationGrade } from '@/lib/models/tenant';
import type { TenantDraft } from '@/lib/repositories/tenant-repository';

/**
 * Form fields to a `TenantDraft`.
 *
 * Shared by the create and edit screens rather than written once each: they
 * post the same fields, and two copies of "which cell does this input mean"
 * is two chances for one of them to fall behind the model.
 *
 * Deliberately **shapes, does not validate**. The store already refuses to
 * write anything that would not read back — it parses the row with the read
 * path's own parser first — so a rule restated here would be a second copy
 * that drifts the moment one side gains a rule the other lacks. What this
 * does is trim, and map a blank grade to null, because "" is not a grade.
 */
export function tenantDraftFromForm(form: FormData): TenantDraft {
  const text = (field: string): string => String(form.get(field) ?? '').trim();

  const grade = text('evaluationGrade');

  return {
    fullName: text('fullName'),
    nickname: text('nickname'),
    idCardLast4: text('idCardLast4'),
    phone: text('phone'),
    occupation: text('occupation'),
    // Blank is "not yet assessed", which is null rather than the string "".
    evaluationGrade: grade === '' ? null : (grade as EvaluationGrade),
    note: text('note'),
    address: {
      houseNo: text('address.houseNo'),
      road: text('address.road'),
      subdistrict: text('address.subdistrict'),
      district: text('address.district'),
      province: text('address.province'),
      postcode: text('address.postcode'),
    },
  };
}
