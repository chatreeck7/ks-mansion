/**
 * The console's dropdown (owner, 8 พ.ย. 2569: the browser's list looks
 * out of place next to the notebook).
 *
 * Progressive enhancement of every `<select>` in the console: the real
 * select stays in the form — visually hidden, still posting, still
 * validated — and a button in the field's own style opens a listbox in the
 * console's colours. Choosing sets the select's value and fires `change`,
 * so every script and inline handler that listened to the select keeps
 * working. `data-native` opts a select out. Below 640px the list opens as a
 * sheet from the bottom of the screen; a long list gets a search box.
 */

interface Item {
  value: string;
  label: string;
  disabled: boolean;
  group: string | null;
}

interface Open {
  select: HTMLSelectElement;
  button: HTMLButtonElement;
  items: Item[];
  active: number;
  query: string;
}

let popover: HTMLDivElement | null = null;
let backdrop: HTMLDivElement | null = null;
let open: Open | null = null;
let typed = '';
let typedAt = 0;
let uid = 0;

const CHEVRON =
  '<svg aria-hidden="true" viewBox="0 0 20 20" class="h-4 w-4 flex-none text-console-ink-soft" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 7.5l5 5 5-5"/></svg>';
const SEARCH_FROM = 9;

function itemsOf(select: HTMLSelectElement): Item[] {
  return [...select.options].map((option) => ({
    value: option.value,
    label: option.label || option.text,
    disabled: option.disabled,
    group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : null,
  }));
}

function sync(select: HTMLSelectElement, button: HTMLButtonElement): void {
  const option = select.selectedOptions[0];
  const text = button.querySelector<HTMLElement>('[data-label]');
  if (text) {
    text.textContent = option ? option.label || option.text : '';
    text.classList.toggle('text-console-ink-faint', !option || option.value === '');
  }
  // `hidden` alone loses to the button's `flex` class.
  button.style.display = select.hidden ? 'none' : '';
  button.disabled = select.disabled;
}

function enhance(select: HTMLSelectElement): void {
  select.dataset.enhanced = 'true';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${select.className} flex items-center justify-between gap-2 text-left cursor-pointer`;
  const id = select.id || `select-${++uid}`;
  const label = select.labels?.[0] ?? null;
  if (label && !label.id) label.id = `${id}-label`;
  select.id = `${id}-native`;
  button.id = id;
  const valueId = `${id}-value`;
  button.innerHTML = `<span id="${valueId}" data-label class="truncate"></span>${CHEVRON}`;
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const ariaLabel = select.getAttribute('aria-label');
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  else if (label) button.setAttribute('aria-labelledby', `${label.id} ${valueId}`);

  // Still in the form, still validated, but out of sight and out of the tab
  // order; anything that focuses it (a label click, a validation bubble)
  // lands on the button instead.
  select.classList.add('sr-only');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.after(button);
  sync(select, button);

  select.addEventListener('change', () => sync(select, button));
  select.addEventListener('focus', () => button.focus());
  select.addEventListener('invalid', () => {
    button.classList.add('border-console-crit');
    button.focus();
  });
  new MutationObserver(() => sync(select, button)).observe(select, { attributes: true, attributeFilter: ['hidden', 'disabled'] });
  button.addEventListener('click', () => (open?.button === button ? close() : show(select, button)));
  button.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && !open) {
      event.preventDefault();
      show(select, button);
    }
  });
}

export function enhanceSelects(root: ParentNode = document): void {
  root
    .querySelectorAll<HTMLSelectElement>('select:not([multiple]):not([data-native]):not([data-enhanced])')
    .forEach(enhance);
}

function ensurePopover(): HTMLDivElement {
  if (popover) return popover;
  backdrop = document.createElement('div');
  backdrop.className = 'fixed inset-0 z-40 bg-console-ink/30 sm:hidden';
  backdrop.hidden = true;
  backdrop.addEventListener('click', () => close());
  popover = document.createElement('div');
  popover.className =
    'fixed z-50 overflow-hidden rounded-xl border border-console-line bg-console-card text-console-ink ' +
    'shadow-[0_12px_32px_rgba(30,45,74,0.18)] max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[70vh] max-sm:rounded-b-none';
  popover.hidden = true;
  popover.addEventListener('keydown', onKey);
  popover.addEventListener('click', onClick);
  popover.addEventListener('input', (event) => {
    if (!open) return;
    open.query = (event.target as HTMLInputElement).value;
    open.active = visible().find((i) => !open!.items[i]!.disabled) ?? -1;
    renderList();
  });
  popover.addEventListener('mousemove', (event) => {
    const li = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (!li || !open) return;
    const index = Number(li.dataset.index);
    if (index !== open.active) {
      open.active = index;
      highlight();
    }
  });
  document.body.append(backdrop, popover);
  document.addEventListener('mousedown', (event) => {
    if (!open || !popover) return;
    const target = event.target as Node;
    if (!popover.contains(target) && !open.button.contains(target)) close(false);
  });
  window.addEventListener('resize', () => open && place());
  return popover;
}

function visible(): number[] {
  if (!open) return [];
  const q = open.query.trim().toLowerCase();
  return open.items.map((_, i) => i).filter((i) => !q || open!.items[i]!.label.toLowerCase().includes(q));
}

function show(select: HTMLSelectElement, button: HTMLButtonElement): void {
  if (open) close(false);
  const box = ensurePopover();
  const items = itemsOf(select);
  open = { select, button, items, active: Math.max(0, select.selectedIndex), query: '' };
  button.setAttribute('aria-expanded', 'true');
  button.classList.remove('border-console-crit');
  const searchable = items.length >= SEARCH_FROM;
  const listId = `${button.id}-listbox`;
  box.innerHTML =
    (searchable
      ? `<div class="border-b border-console-line p-2"><input type="search" data-search placeholder="พิมพ์เพื่อค้นหา" aria-label="ค้นหา" aria-controls="${listId}"
          class="min-h-11 w-full rounded-lg border-[1.5px] border-console-line-strong bg-console-card px-3 text-[15px] focus:border-console-ink focus:outline-none" /></div>`
      : '') +
    `<ul id="${listId}" role="listbox" tabindex="-1" class="m-0 max-h-[60vh] list-none overflow-y-auto p-1 outline-none sm:max-h-80"></ul>`;
  box.hidden = false;
  if (backdrop) backdrop.hidden = false;
  renderList();
  place();
  const search = box.querySelector<HTMLInputElement>('[data-search]');
  (search ?? box.querySelector<HTMLElement>('[role=listbox]'))?.focus();
  scrollActive();
}

function close(returnFocus = true): void {
  if (!open || !popover) return;
  open.button.setAttribute('aria-expanded', 'false');
  popover.hidden = true;
  if (backdrop) backdrop.hidden = true;
  const button = open.button;
  open = null;
  if (returnFocus) button.focus();
}

function place(): void {
  if (!open || !popover) return;
  if (window.innerWidth < 640) {
    popover.style.cssText = '';
    return;
  }
  const rect = open.button.getBoundingClientRect();
  const width = Math.max(rect.width, 224);
  popover.style.width = `${width}px`;
  const height = popover.offsetHeight;
  const below = rect.bottom + 4;
  const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below;
  popover.style.top = `${top}px`;
  popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function renderList(): void {
  if (!open || !popover) return;
  const list = popover.querySelector<HTMLUListElement>('[role=listbox]');
  if (!list) return;
  const shown = visible();
  let group: string | null = null;
  let html = '';
  for (const index of shown) {
    const item = open.items[index]!;
    if (item.group !== group && item.group !== null) {
      html += `<li role="presentation" class="px-3 pb-1 pt-2 text-[13px] font-semibold text-console-ink-soft">${escape(item.group)}</li>`;
    }
    group = item.group;
    const selected = open.select.selectedIndex === index;
    html += `<li role="option" id="${open.button.id}-opt-${index}" data-index="${index}" aria-selected="${selected}" ${item.disabled ? 'aria-disabled="true"' : ''}
      class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-[15px] ${item.group ? 'ps-5' : ''} ${item.disabled ? 'cursor-not-allowed text-console-ink-faint' : ''} ${selected ? 'font-semibold' : ''}">
      <span class="w-4 flex-none text-console-ok">${selected ? '✓' : ''}</span><span>${escape(item.label) || '&nbsp;'}</span></li>`;
  }
  if (shown.length === 0) html = '<li role="presentation" class="px-3 py-3 text-[15px] text-console-ink-faint">ไม่พบรายการ</li>';
  list.innerHTML = html;
  highlight();
}

function highlight(): void {
  if (!open || !popover) return;
  const list = popover.querySelector<HTMLElement>('[role=listbox]');
  popover.querySelectorAll<HTMLElement>('[role=option]').forEach((li) => {
    const on = Number(li.dataset.index) === open!.active;
    li.classList.toggle('bg-console-highlight/40', on);
  });
  const activeId = `${open.button.id}-opt-${open.active}`;
  const hasActive = !!popover.querySelector(`#${CSS.escape(activeId)}`);
  for (const el of [list, popover.querySelector<HTMLElement>('[data-search]')]) {
    if (!el) continue;
    if (hasActive) el.setAttribute('aria-activedescendant', activeId);
    else el.removeAttribute('aria-activedescendant');
  }
}

function scrollActive(): void {
  if (!open || !popover) return;
  popover.querySelector(`#${CSS.escape(`${open.button.id}-opt-${open.active}`)}`)?.scrollIntoView({ block: 'nearest' });
}

function choose(index: number): void {
  if (!open) return;
  const item = open.items[index];
  if (!item || item.disabled) return;
  const { select } = open;
  const changed = select.selectedIndex !== index;
  select.selectedIndex = index;
  close();
  if (changed) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function onClick(event: MouseEvent): void {
  const li = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
  if (li) choose(Number(li.dataset.index));
}

function step(by: number): void {
  if (!open) return;
  const shown = visible().filter((i) => !open!.items[i]!.disabled);
  if (shown.length === 0) return;
  const at = shown.indexOf(open.active);
  const next = at === -1 ? (by > 0 ? 0 : shown.length - 1) : Math.min(shown.length - 1, Math.max(0, at + by));
  open.active = shown[next]!;
  highlight();
  scrollActive();
}

function onKey(event: KeyboardEvent): void {
  if (!open) return;
  const shown = visible().filter((i) => !open!.items[i]!.disabled);
  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      close();
      return;
    case 'Tab':
      close(false);
      return;
    case 'ArrowDown':
      event.preventDefault();
      step(1);
      return;
    case 'ArrowUp':
      event.preventDefault();
      step(-1);
      return;
    case 'Home':
    case 'End':
      if ((event.target as HTMLElement).matches('[data-search]')) return;
      event.preventDefault();
      open.active = (event.key === 'Home' ? shown[0] : shown[shown.length - 1]) ?? open.active;
      highlight();
      scrollActive();
      return;
    case 'Enter':
      event.preventDefault();
      choose(open.active);
      return;
    case ' ':
      if ((event.target as HTMLElement).matches('[data-search]')) return;
      event.preventDefault();
      choose(open.active);
      return;
  }
  // Type-ahead on a list with no search box.
  if (event.key.length === 1 && !(event.target as HTMLElement).matches('[data-search]')) {
    const now = Date.now();
    typed = now - typedAt > 700 ? event.key : typed + event.key;
    typedAt = now;
    const hit = shown.find((i) => open!.items[i]!.label.toLowerCase().startsWith(typed.toLowerCase()));
    if (hit !== undefined) {
      open.active = hit;
      highlight();
      scrollActive();
    }
  }
}
