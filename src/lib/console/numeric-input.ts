import { sanitizeFigure, westernDigits, type FigureKind } from '@/lib/format/figure';

/**
 * Number fields take only what a number is made of (owner, 9 พ.ย. 2569:
 * "ช่องกรอกตัวเลขกรอกอย่างอื่นได้ … block การกรอก character ที่ไม่ควรกรอก").
 *
 * Every console field that asks for a figure already says so with
 * `inputmode` (numeric / decimal), `type="tel"` or `type="number"`; this
 * reads that, so no page has to opt in. A letter typed there is not
 * inserted, a pasted "2,636 บาท" goes in as "2,636", Thai digits become
 * 0–9, and a short note under the field says why the key did nothing.
 * `data-figure="off"` leaves a field alone.
 *
 * The server still checks every figure (`parseFigure`): this only stops the
 * slip at the keyboard.
 */

const HINT: Record<FigureKind, string> = {
  integer: 'ช่องนี้ใส่ได้เฉพาะตัวเลข',
  decimal: 'ช่องนี้ใส่ได้เฉพาะตัวเลข (มี , หรือ . ได้)',
  tel: 'ช่องนี้ใส่ได้เฉพาะเบอร์โทร: ตัวเลข และ - ( ) , /',
};

export function figureKindOf(input: HTMLInputElement): FigureKind | null {
  const declared = input.dataset.figure;
  if (declared === 'off') return null;
  if (declared === 'integer' || declared === 'decimal' || declared === 'tel') return declared;
  if (input.type === 'tel') return 'tel';
  if (input.type === 'number') return input.step && input.step !== '1' ? 'decimal' : 'integer';
  const mode = input.inputMode || input.getAttribute('inputmode');
  if (mode === 'numeric') return 'integer';
  if (mode === 'decimal') return 'decimal';
  return null;
}

let note: HTMLElement | null = null;
let noteTimer = 0;

function warn(input: HTMLInputElement, kind: FigureKind): void {
  if (!note) {
    note = document.createElement('div');
    note.setAttribute('role', 'status');
    note.className =
      'pointer-events-none fixed z-[60] rounded-md bg-console-crit px-2.5 py-1 text-sm font-medium text-white shadow-lg';
    document.body.append(note);
  }
  const box = input.getBoundingClientRect();
  note.textContent = HINT[kind];
  note.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - 300))}px`;
  note.style.top = `${box.bottom + 6}px`;
  note.hidden = false;
  input.classList.add('figure-refused');
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => {
    if (note) note.hidden = true;
    input.classList.remove('figure-refused');
  }, 1800);
}

/** Puts `text` where the caret is, as typing would. Text fields only. */
function insert(input: HTMLInputElement, text: string): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(text, start, end, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function enhanceNumericInputs(root: Document = document): void {
  root.addEventListener(
    'beforeinput',
    (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !event.data) return;
      const kind = figureKindOf(input);
      if (!kind) return;
      const typed = event.data;
      const kept = sanitizeFigure(typed, kind);
      if (kept === typed) return;
      event.preventDefault();
      // Thai digits, or the figure out of a paste: put in what is a number.
      if (kept !== '' && input.type !== 'number') insert(input, kept);
      if (kept !== westernDigits(typed)) warn(input, kind);
    },
    true,
  );

  // Whatever got past beforeinput — autofill, an IME, an old browser.
  root.addEventListener(
    'input',
    (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type === 'number') return;
      const kind = figureKindOf(input);
      if (!kind) return;
      const clean = sanitizeFigure(input.value, kind);
      if (clean === input.value) return;
      const caret = Math.max(0, (input.selectionStart ?? clean.length) - (input.value.length - clean.length));
      input.value = clean;
      input.setSelectionRange(caret, caret);
      warn(input, kind);
    },
    true,
  );
}
