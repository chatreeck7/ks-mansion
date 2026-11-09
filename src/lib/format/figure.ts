/**
 * Reading a typed figure — baht, a meter dial, a count — strictly
 * (owner, 9 พ.ย. 2569: "ช่องกรอกตัวเลขกรอกอย่างอื่นได้").
 *
 * `Number()` is not a validator: `2,6e6`, `0x1F`, `Infinity` and `+5` all
 * parse. A figure here is digits, optionally with thousands separators and a
 * decimal part, and nothing else. Thai digits (๐–๙) are read as the same
 * digits, since a Thai keyboard types them on the number row.
 */

const THAI_DIGITS = /[๐-๙]/g;

/** ๐–๙ → 0–9; every other character untouched. */
export function westernDigits(text: string): string {
  return text.replace(THAI_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0e50));
}

const FIGURE = /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/;

/**
 * Blank → null ("not written"), a figure → its value, anything else → NaN,
 * so callers keep their own blank rule and still see the junk.
 */
export function parseFigure(raw: unknown): number | null {
  const text = westernDigits(String(raw ?? '')).trim();
  if (text === '') return null;
  if (!FIGURE.test(text)) return NaN;
  return Number(text.replace(/,/g, ''));
}

/**
 * The fields of a submitted form that hold something other than a figure,
 * as one Thai message — or null when every one reads.
 */
export function figureProblems(
  form: { get(name: string): unknown },
  labels: Record<string, string>,
): string | null {
  const bad = Object.entries(labels)
    .filter(([field]) => Number.isNaN(parseFigure(form.get(field))))
    .map(([, label]) => label);
  return bad.length === 0 ? null : `${bad.join(', ')} ต้องเป็นตัวเลขเท่านั้น`;
}

/** Which characters a field accepts as it is typed into. */
export type FigureKind = 'integer' | 'decimal' | 'tel';

/**
 * What is left of a typed value once the characters the field does not take
 * are dropped — Thai digits kept as digits. A decimal keeps its first point
 * only.
 */
export function sanitizeFigure(value: string, kind: FigureKind): string {
  const digits = westernDigits(value);
  if (kind === 'integer') return digits.replace(/\D/g, '');
  if (kind === 'tel') return digits.replace(/[^\d+\-() ,/]/g, '');
  const kept = digits.replace(/[^\d.,]/g, '');
  const point = kept.indexOf('.');
  return point === -1 ? kept : kept.slice(0, point + 1) + kept.slice(point + 1).replace(/\./g, '');
}
