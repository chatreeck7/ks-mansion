import { buttonClass } from '@/lib/console/ui';

/**
 * A pause before the steps that are hard to take back (owner, 9 พ.ย. 2569:
 * "ตอนรับเงินอยากให้มี confirmation … slow-down ลดการกรอกผิดพลาด").
 *
 * The console's own dialog, not `window.confirm`: it can show what is about
 * to be written — each room and amount, the total, anything unusual — so the
 * check is reading a summary, not clicking "OK" on a sentence. Focus starts
 * on the heading, so a stray Enter does not confirm; Esc or "กลับไปแก้"
 * returns to the form with everything as typed.
 *
 * Two ways in:
 * - `guardForm(form, build)`: the page builds the summary from the form at
 *   the moment of submit (return null when there is nothing to confirm).
 * - `<form data-confirm="…">` with optional `data-confirm-title`,
 *   `data-confirm-label` and `data-confirm-tone="danger"`, for a plain
 *   "are you sure" — wired for every page by `enhanceConfirms()`.
 *
 * Without script the forms submit as before; the server's own checks still
 * stand. Every POST form also locks its buttons once it is on its way, so a
 * double click cannot record a payment twice.
 */

export interface ConfirmRow {
  label: string;
  value: string;
  /** Small line under the row, e.g. "เกินยอดค้าง 200". */
  note?: string;
  warn?: boolean;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  rows?: ConfirmRow[];
  total?: { label: string; value: string };
  /** Shown above the buttons, highlighted: things worth a second look. */
  warnings?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

let dialog: HTMLDialogElement | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  dialog?.remove();
  dialog = el(
    'dialog',
    'console-confirm m-auto w-[min(32rem,calc(100vw-32px))] max-h-[calc(100vh-48px)] overflow-auto rounded-2xl border-0 bg-console-card p-0 text-console-ink shadow-2xl backdrop:bg-console-ink/40',
  );
  dialog.setAttribute('aria-labelledby', 'console-confirm-title');

  const body = el('div', 'flex flex-col gap-3 p-5');
  const title = el('h2', 'm-0 font-hand text-xl font-semibold', options.title);
  title.id = 'console-confirm-title';
  title.tabIndex = -1;
  body.append(title);
  if (options.message) body.append(el('p', 'm-0 text-[15px] text-console-ink-soft', options.message));

  if (options.rows?.length) {
    const list = el('ul', 'm-0 list-none border-y-2 border-console-ink p-0');
    for (const row of options.rows) {
      const item = el('li', 'border-b border-console-rule py-2 last:border-0');
      const line = el('div', 'flex items-baseline justify-between gap-3');
      line.append(
        el('span', 'font-hand text-[17px] font-semibold', row.label),
        // Figures in the figure face; names and dates in the text face.
        el('span', `text-right text-[16px] ${/^[\d,.\s→-]+/.test(row.value) ? 'font-figure tabular-nums' : ''}`, row.value),
      );
      item.append(line);
      if (row.note) {
        item.append(el('p', `m-0 text-sm ${row.warn ? 'font-medium text-console-warn' : 'text-console-ink-soft'}`, row.note));
      }
      if (row.warn) item.classList.add('bg-console-warn-bg/60', '-mx-2', 'px-2');
      list.append(item);
    }
    body.append(list);
  }
  if (options.total) {
    const total = el('div', 'flex items-baseline justify-between gap-3 text-base font-semibold');
    total.append(el('span', '', options.total.label), el('span', 'font-figure text-lg tabular-nums', options.total.value));
    body.append(total);
  }
  if (options.warnings?.length) {
    const box = el('div', 'rounded-lg bg-console-warn-bg px-3 py-2 text-[15px] text-console-warn');
    for (const warning of options.warnings) box.append(el('p', 'm-0', `⚠ ${warning}`));
    body.append(box);
  }

  const actions = el('div', 'flex flex-col-reverse gap-2 border-t border-console-line bg-console-paper px-5 py-3 sm:flex-row sm:justify-end');
  const cancel = el('button', buttonClass('secondary', 'md'), options.cancelLabel ?? 'กลับไปแก้');
  cancel.type = 'button';
  const confirm = el('button', buttonClass(options.tone === 'danger' ? 'danger' : 'primary', 'md'), options.confirmLabel);
  confirm.type = 'button';
  actions.append(cancel, confirm);

  dialog.append(body, actions);
  document.body.append(dialog);

  const open = dialog;
  return new Promise((resolve) => {
    let answer = false;
    cancel.addEventListener('click', () => open.close());
    confirm.addEventListener('click', () => {
      answer = true;
      open.close();
    });
    open.addEventListener('close', () => {
      open.remove();
      if (dialog === open) dialog = null;
      resolve(answer);
    });
    open.showModal();
    title.focus();
  });
}

const builders = new WeakMap<HTMLFormElement, (submitter: HTMLElement | null) => ConfirmOptions | null>();

/** Ask before `form` submits, with the summary `build` makes at that moment. */
export function guardForm(
  form: HTMLFormElement,
  build: (submitter: HTMLElement | null) => ConfirmOptions | null,
): void {
  builders.set(form, build);
}

function declared(form: HTMLFormElement): ConfirmOptions | null {
  const message = form.dataset.confirm;
  if (message === undefined) return null;
  return {
    title: form.dataset.confirmTitle ?? 'ยืนยันอีกครั้ง',
    message,
    confirmLabel: form.dataset.confirmLabel ?? 'ยืนยัน',
    cancelLabel: form.dataset.confirmCancel ?? 'ยกเลิก',
    tone: form.dataset.confirmTone === 'danger' ? 'danger' : 'default',
  };
}

const confirmed = new WeakSet<HTMLFormElement>();

export function enhanceConfirms(root: Document = document): void {
  root.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(event instanceof SubmitEvent) || !(form instanceof HTMLFormElement)) return;
    const submitter = event.submitter;

    if (confirmed.has(form)) {
      confirmed.delete(form);
    } else {
      const build = builders.get(form);
      const options = build ? build(submitter) : declared(form);
      if (options) {
        event.preventDefault();
        void confirmDialog(options).then((ok) => {
          if (!ok) return;
          confirmed.add(form);
          form.requestSubmit(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
        });
        return;
      }
    }

    // On its way: lock the buttons once the submission has read them (a
    // disabled submitter would drop its own name/value from the data).
    if ((form.method || 'get').toLowerCase() !== 'post') return;
    window.setTimeout(() => {
      if (event.defaultPrevented) return;
      for (const button of form.querySelectorAll<HTMLButtonElement>('button[type="submit"], button:not([type])')) {
        button.disabled = true;
      }
      form.setAttribute('aria-busy', 'true');
    }, 0);
  });

  // Back to a page from the browser's cache: its buttons work again.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    for (const form of document.querySelectorAll<HTMLFormElement>('form[aria-busy="true"]')) {
      form.removeAttribute('aria-busy');
      for (const button of form.querySelectorAll<HTMLButtonElement>('button')) button.disabled = false;
    }
  });
}
