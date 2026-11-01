/**
 * Filling `{placeholders}` in an admin-written block of text (KS-31).
 *
 * The output is **segments, not a string**, so the page can show a filled-in
 * value the way a pen-filled blank looks (underlined) and an unfilled one the
 * way the paper does (a dotted line to write on). A blank must never print as
 * nothing: "อายุ ปี" with the number missing reads as a typo, where
 * "อายุ ........ ปี" reads as a form waiting for a pen.
 */

export type Segment =
  /** Literal text the admin wrote. */
  | { kind: 'text'; text: string }
  /** A placeholder that resolved to a value. */
  | { kind: 'value'; text: string }
  /** A placeholder with nothing on file — printed as a writing line. */
  | { kind: 'blank'; name: string }
  /** A placeholder name the console does not know — printed as typed, flagged. */
  | { kind: 'unknown'; text: string };

/** Values by placeholder name. `null` or blank means "nothing on file". */
export type PlaceholderValues = Record<string, string | null | undefined>;

const PLACEHOLDER = /\{([^{}\n]{1,40})\}/g;

export function renderTemplate(body: string, values: PlaceholderValues): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of body.matchAll(PLACEHOLDER)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ kind: 'text', text: body.slice(last, index) });
    const name = match[1]!.trim();
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      segments.push({ kind: 'unknown', text: match[0] });
    } else {
      const value = values[name];
      segments.push(
        value === null || value === undefined || value.trim() === ''
          ? { kind: 'blank', name }
          : { kind: 'value', text: value },
      );
    }
    last = index + match[0].length;
  }
  if (last < body.length) segments.push({ kind: 'text', text: body.slice(last) });
  return segments;
}

/** Renders each line of a multi-line block on its own. */
export function renderLines(body: string, values: PlaceholderValues): Segment[][] {
  return body
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => renderTemplate(line, values));
}

/** Placeholder names used in a text that are not in `known` — for the editor. */
export function unknownPlaceholders(body: string, known: Iterable<string>): string[] {
  const names = new Set(known);
  const unknown = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER)) {
    const name = match[1]!.trim();
    if (!names.has(name)) unknown.add(name);
  }
  return [...unknown];
}

/** Segments as plain text, blanks as dots — for tests and the editor preview. */
export function segmentsToText(segments: Segment[]): string {
  return segments
    .map((segment) =>
      segment.kind === 'blank' ? '…………' : segment.text,
    )
    .join('');
}
