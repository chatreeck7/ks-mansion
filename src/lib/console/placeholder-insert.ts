/**
 * Putting `{ช่องข้อมูล}` into a template field, in a way that always shows
 * something happened (owner, 9 พ.ย. 2569: the chip row did nothing unless a
 * field had been clicked first, and nothing said so).
 *
 * - Each field has its own "+ แทรกช่องข้อมูล" button: a searchable list of
 *   the placeholders, and the choice goes in where the caret was in *that*
 *   field — or at the end if it was never clicked.
 * - The chip row at the top still works: into the last field clicked, and
 *   with none, the placeholder is copied to the clipboard and the page says
 *   so.
 * - Every insert flashes the field and says what went in.
 */

export interface PlaceholderOption {
  name: string;
  description: string;
}

/** Pure: `value` with `text` in place of `[start, end)`, and the caret after it. */
export function insertAt(value: string, start: number, end: number, text: string): { value: string; caret: number } {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  return { value: value.slice(0, from) + text + value.slice(to), caret: from + text.length };
}

type Field = HTMLInputElement | HTMLTextAreaElement;

const carets = new WeakMap<Field, { start: number; end: number }>();
let lastField: Field | null = null;
let menu: HTMLDivElement | null = null;
let menuFor: { field: Field; button: HTMLButtonElement } | null = null;

function remember(field: Field): void {
  carets.set(field, { start: field.selectionStart ?? field.value.length, end: field.selectionEnd ?? field.value.length });
}

function flash(field: Field): void {
  field.classList.add('ring-4', 'ring-console-highlight');
  window.setTimeout(() => field.classList.remove('ring-4', 'ring-console-highlight'), 1200);
}

function say(status: HTMLElement | null, text: string): void {
  if (!status) return;
  status.textContent = text;
  window.clearTimeout(Number(status.dataset.timer ?? 0));
  status.dataset.timer = String(window.setTimeout(() => (status.textContent = ''), 6000));
}

function insert(field: Field, text: string, status: HTMLElement | null): void {
  const caret = carets.get(field) ?? { start: field.value.length, end: field.value.length };
  const next = insertAt(field.value, caret.start, caret.end, text);
  field.value = next.value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
  field.setSelectionRange(next.caret, next.caret);
  remember(field);
  flash(field);
  say(status, `แทรก ${text} แล้ว — กดบันทึกเพื่อดูผลบนกระดาษ`);
}

function statusFor(field: Field): HTMLElement | null {
  return field.closest('fieldset')?.querySelector<HTMLElement>(`[data-insert-status="${field.name}"]`) ?? null;
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function closeMenu(returnFocus = false): void {
  if (!menu) return;
  menu.hidden = true;
  const owner = menuFor;
  menuFor = null;
  owner?.button.setAttribute('aria-expanded', 'false');
  if (returnFocus) owner?.button.focus();
}

function openMenu(button: HTMLButtonElement, field: Field, options: PlaceholderOption[]): void {
  if (!menu) {
    menu = document.createElement('div');
    menu.className =
      'fixed z-50 w-[22rem] overflow-hidden rounded-xl border border-console-line bg-console-card text-console-ink ' +
      'shadow-[0_12px_32px_rgba(30,45,74,0.18)] max-sm:inset-x-0 max-sm:bottom-0 max-sm:w-auto max-sm:rounded-b-none';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'แทรกช่องข้อมูล');
    document.body.append(menu);
    document.addEventListener('mousedown', (event) => {
      if (menu && !menu.hidden && !menu.contains(event.target as Node) && !menuFor?.button.contains(event.target as Node)) closeMenu();
    });
  }
  menuFor = { field, button };
  button.setAttribute('aria-expanded', 'true');
  menu.innerHTML = `<div class="border-b border-console-line p-2">
      <input type="search" data-search placeholder="ค้นหา เช่น ผู้เช่า, ค่าเช่า" aria-label="ค้นหาช่องข้อมูล"
        class="min-h-11 w-full rounded-lg border-[1.5px] border-console-line-strong bg-console-card px-3 text-[15px] focus:border-console-ink focus:outline-none" />
    </div>
    <ul class="m-0 max-h-[50vh] list-none overflow-y-auto p-1 sm:max-h-80" data-list></ul>`;
  const list = menu.querySelector<HTMLUListElement>('[data-list]')!;
  const search = menu.querySelector<HTMLInputElement>('[data-search]')!;
  const render = () => {
    const q = search.value.trim();
    const shown = options.filter((o) => !q || o.name.includes(q) || o.description.includes(q));
    list.innerHTML = shown.length
      ? shown
          .map(
            (o) => `<li><button type="button" data-name="${escape(o.name)}"
              class="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-console-highlight/40 focus-visible:bg-console-highlight/40 focus-visible:outline-none">
              <span class="text-[15px] font-semibold">{${escape(o.name)}}</span>
              <span class="text-[13px] text-console-ink-soft">${escape(o.description)}</span></button></li>`,
          )
          .join('')
      : '<li class="px-3 py-3 text-[15px] text-console-ink-faint">ไม่พบช่องข้อมูล</li>';
  };
  render();
  search.addEventListener('input', render);
  menu.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === 'Enter' && event.target === search) {
      event.preventDefault();
      list.querySelector<HTMLButtonElement>('[data-name]')?.click();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...list.querySelectorAll<HTMLButtonElement>('[data-name]')];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? Math.min(items.length - 1, at + 1) : at - 1;
      (next < 0 ? search : items[next])?.focus();
    }
  };
  list.onclick = (event) => {
    const item = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-name]');
    if (!item || !menuFor) return;
    const target = menuFor.field;
    closeMenu();
    insert(target, `{${item.dataset.name}}`, statusFor(target));
  };
  menu.hidden = false;
  if (window.innerWidth >= 640) {
    const rect = button.getBoundingClientRect();
    const height = menu.offsetHeight;
    const below = rect.bottom + 4;
    menu.style.top = `${below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  } else {
    menu.style.top = '';
    menu.style.left = '';
  }
  search.focus();
}

export function setupPlaceholderInsert(form: HTMLFormElement): void {
  const options = JSON.parse(form.dataset.placeholders ?? '[]') as PlaceholderOption[];
  const targetLabel = document.querySelector<HTMLElement>('[data-insert-target]');
  const chipStatus = document.querySelector<HTMLElement>('[data-chip-status]');

  for (const field of form.querySelectorAll<Field>('[data-template-field]')) {
    for (const type of ['keyup', 'mouseup', 'select', 'input', 'blur']) field.addEventListener(type, () => remember(field));
    field.addEventListener('focus', () => {
      if (lastField && lastField !== field) lastField.classList.remove('ring-2', 'ring-console-highlight/70');
      lastField = field;
      field.classList.add('ring-2', 'ring-console-highlight/70');
      if (targetLabel) targetLabel.textContent = `จะแทรกที่: ${field.dataset.fieldLabel ?? 'ช่องที่คลิกล่าสุด'}`;
    });
  }

  for (const button of form.querySelectorAll<HTMLButtonElement>('[data-insert-menu]')) {
    const field = form.elements.namedItem(button.dataset.insertMenu ?? '') as Field | null;
    if (!field) continue;
    button.addEventListener('click', () => (menuFor?.button === button ? closeMenu(true) : openMenu(button, field, options)));
  }

  for (const chip of document.querySelectorAll<HTMLButtonElement>('[data-insert]')) {
    chip.addEventListener('mousedown', (event) => event.preventDefault());
    chip.addEventListener('click', async () => {
      const text = chip.dataset.insert ?? '';
      if (lastField && lastField.isConnected && lastField.offsetParent !== null) {
        insert(lastField, text, statusFor(lastField));
        say(chipStatus, `แทรก ${text} ลงใน${lastField.dataset.fieldLabel ?? 'ช่องที่คลิกล่าสุด'}แล้ว`);
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        say(chipStatus, `คัดลอก ${text} แล้ว — วางในช่องข้อความได้ (Ctrl+V) หรือคลิกในช่องข้อความก่อนแล้วกดอีกครั้ง`);
      } catch {
        say(chipStatus, `คลิกในช่องข้อความที่ต้องการก่อน แล้วกด ${text} อีกครั้ง`);
      }
    });
  }
}
