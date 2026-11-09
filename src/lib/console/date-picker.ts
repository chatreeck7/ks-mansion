import {
  addDays,
  addMonths,
  fromDate,
  monthGrid,
  parseIso,
  sameDay,
  THAI_MONTHS_ABBR,
  THAI_MONTHS_LONG,
  THAI_WEEKDAYS,
  thaiLabel,
  thaiLongLabel,
  toIso,
  withinRange,
  type Day,
} from './calendar';

/**
 * The console's calendar (owner, 8 พ.ย. 2569: the browser's own picker
 * shows ค.ศ. month-first and cannot be dressed in the notebook's colours).
 *
 * Progressive enhancement of `DateInput.astro`: the page is rendered with a
 * real `<input type="date">`, and this turns it into a hidden field plus a
 * button that reads `8 พ.ย. 2569`. Without script the native field stays and
 * still posts `YYYY-MM-DD`. One popover is shared by every field on the page;
 * below 640px it opens as a sheet from the bottom of the screen.
 */

interface Open {
  input: HTMLInputElement;
  button: HTMLButtonElement;
  focus: Day;
  view: { year: number; month: number };
  mode: 'days' | 'months';
  min: Day | null;
  max: Day | null;
}

let popover: HTMLDivElement | null = null;
let backdrop: HTMLDivElement | null = null;
let open: Open | null = null;

const CALENDAR_ICON =
  '<svg aria-hidden="true" viewBox="0 0 20 20" class="h-5 w-5 flex-none text-console-ink-soft" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.75v3.5M13 2.75v3.5"/></svg>';

const today = () => fromDate(new Date());

function label(input: HTMLInputElement, button: HTMLButtonElement): void {
  const day = parseIso(input.value);
  const text = button.querySelector<HTMLElement>('[data-label]');
  if (!text) return;
  text.textContent = day ? thaiLabel(day) : 'เลือกวันที่';
  text.classList.toggle('text-console-ink-faint', !day);
}

function enhance(input: HTMLInputElement): void {
  input.dataset.enhanced = 'true';
  const field = input.closest<HTMLElement>('.date-field');
  const echo = field?.querySelector<HTMLElement>('[data-date-echo]');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${input.className.replace(/\b(date-input|font-figure)\b/g, '')} flex items-center justify-between gap-2 text-left cursor-pointer`;
  button.id = input.id;
  input.id = `${input.id}-value`;
  for (const attr of ['aria-label', 'aria-invalid']) {
    const value = input.getAttribute(attr);
    if (value) button.setAttribute(attr, value);
  }
  const described = (input.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id && id !== echo?.id)
    .join(' ');
  if (described) button.setAttribute('aria-describedby', described);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `<span data-label class="truncate whitespace-nowrap tabular-nums"></span>${CALENDAR_ICON}`;
  input.type = 'hidden';
  input.after(button);
  if (echo) echo.hidden = true;
  label(input, button);
  input.addEventListener('change', () => label(input, button));
  button.addEventListener('click', () => (open?.button === button ? close() : show(input, button)));
}

export function enhanceDateInputs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input[data-date-input]:not([data-enhanced])').forEach(enhance);
}

function ensurePopover(): HTMLDivElement {
  if (popover) return popover;
  backdrop = document.createElement('div');
  backdrop.className = 'fixed inset-0 z-40 bg-console-ink/30 sm:hidden';
  backdrop.hidden = true;
  backdrop.addEventListener('click', () => close());
  popover = document.createElement('div');
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'เลือกวันที่');
  popover.className =
    'fixed z-50 rounded-xl border border-console-line bg-console-card p-3 text-console-ink ' +
    'shadow-[0_12px_32px_rgba(30,45,74,0.18)] ' +
    'max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-b-none max-sm:px-4 max-sm:pb-6 sm:w-[20rem]';
  popover.hidden = true;
  popover.addEventListener('keydown', onKey);
  popover.addEventListener('click', onClick);
  document.body.append(backdrop, popover);
  document.addEventListener('mousedown', (event) => {
    if (!open || !popover) return;
    const target = event.target as Node;
    if (!popover.contains(target) && !open.button.contains(target)) close(false);
  });
  window.addEventListener('resize', () => open && place());
  return popover;
}

function show(input: HTMLInputElement, button: HTMLButtonElement): void {
  if (open) close(false);
  const box = ensurePopover();
  const selected = parseIso(input.value);
  const min = parseIso(input.getAttribute('min'));
  const max = parseIso(input.getAttribute('max'));
  let focus = selected ?? today();
  if (!withinRange(focus, min, max)) focus = max && !withinRange(focus, null, max) ? max : (min ?? focus);
  open = { input, button, focus, view: { year: focus.year, month: focus.month }, mode: 'days', min, max };
  button.setAttribute('aria-expanded', 'true');
  box.hidden = false;
  if (backdrop) backdrop.hidden = false;
  render();
  place();
  focusDay();
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
    popover.style.top = '';
    popover.style.left = '';
    return;
  }
  const rect = open.button.getBoundingClientRect();
  const height = popover.offsetHeight;
  const width = popover.offsetWidth;
  const below = rect.bottom + 6;
  const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
  popover.style.top = `${top}px`;
  popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
}

const NAV =
  'flex h-11 w-11 items-center justify-center rounded-lg text-xl text-console-ink hover:bg-console-sunk ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-ink disabled:opacity-30';
const FOOT =
  'min-h-11 rounded-lg px-3 text-[15px] font-semibold hover:bg-console-sunk ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-ink';

function render(): void {
  if (!open || !popover) return;
  const { view, mode, min, max, input } = open;
  const selected = parseIso(input.value);
  const now = today();
  let html = '';
  if (mode === 'days') {
    html += `<div class="mb-1 flex items-center justify-between">
      <button type="button" data-nav="-1" class="${NAV}" aria-label="เดือนก่อน">‹</button>
      <button type="button" data-mode="months" class="min-h-11 rounded-lg px-3 text-[16px] font-semibold hover:bg-console-sunk focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-ink" aria-label="เลือกเดือนและปี">${THAI_MONTHS_LONG[view.month]} ${view.year + 543}</button>
      <button type="button" data-nav="1" class="${NAV}" aria-label="เดือนถัดไป">›</button>
    </div>`;
    html += `<div class="grid grid-cols-7 gap-0.5 text-center" role="grid">`;
    html += THAI_WEEKDAYS.map((w, i) => `<span class="py-1 text-[13px] font-semibold ${i === 0 ? 'text-console-crit' : 'text-console-ink-soft'}">${w}</span>`).join('');
    for (const day of monthGrid(view.year, view.month)) {
      const inMonth = day.month === view.month;
      const allowed = withinRange(day, min, max);
      const isSelected = sameDay(day, selected);
      const isToday = sameDay(day, now);
      const isFocus = sameDay(day, open.focus);
      const cls = [
        'flex h-11 items-center justify-center rounded-lg font-figure text-[15px] tabular-nums sm:h-9',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-console-ink',
        isSelected ? 'bg-console-ink font-semibold text-white' : allowed ? 'hover:bg-console-highlight/50' : '',
        !isSelected && isToday ? 'ring-[1.5px] ring-inset ring-console-ink font-semibold' : '',
        !isSelected && !inMonth ? 'text-console-ink-faint/70' : '',
        !allowed ? 'cursor-not-allowed text-console-ink-faint/40 line-through' : '',
      ].join(' ');
      html += `<button type="button" data-iso="${toIso(day)}" class="${cls}" tabindex="${isFocus ? 0 : -1}"
        aria-label="${thaiLongLabel(day)}${isToday ? ' (วันนี้)' : ''}" ${isSelected ? 'aria-pressed="true"' : ''} ${allowed ? '' : 'disabled'}>${day.day}</button>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="mb-2 flex items-center justify-between">
      <button type="button" data-year="-1" class="${NAV}" aria-label="ปีก่อน">‹</button>
      <span class="text-[16px] font-semibold">พ.ศ. ${view.year + 543}</span>
      <button type="button" data-year="1" class="${NAV}" aria-label="ปีถัดไป">›</button>
    </div><div class="grid grid-cols-3 gap-1.5">`;
    THAI_MONTHS_ABBR.forEach((name, month) => {
      const current = month === view.month;
      html += `<button type="button" data-month="${month}" class="min-h-11 rounded-lg text-[15px] ${current ? 'bg-console-ink font-semibold text-white' : 'hover:bg-console-highlight/50'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-ink">${name}</button>`;
    });
    html += `</div>`;
  }
  const required = input.hasAttribute('required');
  const todayAllowed = withinRange(now, min, max);
  html += `<div class="mt-2 flex items-center justify-between border-t border-console-line pt-2">
    <button type="button" data-pick-today class="${FOOT} text-console-ink" ${todayAllowed ? '' : 'disabled'}>วันนี้</button>
    <span class="flex gap-1">
      ${required ? '' : `<button type="button" data-clear class="${FOOT} text-console-ink-soft">ล้าง</button>`}
      <button type="button" data-close class="${FOOT} text-console-ink-soft">ปิด</button>
    </span>
  </div>`;
  popover.innerHTML = html;
}

function focusDay(): void {
  if (!open || !popover) return;
  const target =
    popover.querySelector<HTMLButtonElement>(`[data-iso="${toIso(open.focus)}"]`) ??
    popover.querySelector<HTMLButtonElement>('[data-month][class*="bg-console-ink"]');
  target?.focus();
}

function choose(day: Day): void {
  if (!open) return;
  const { input } = open;
  input.value = toIso(day);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  close();
}

function goTo(day: Day): void {
  if (!open) return;
  open.focus = day;
  open.view = { year: day.year, month: day.month };
  render();
  focusDay();
}

function onClick(event: MouseEvent): void {
  if (!open) return;
  const el = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!el || el.hasAttribute('disabled')) return;
  const { dataset } = el;
  if (dataset.iso) {
    const day = parseIso(dataset.iso);
    if (day) choose(day);
  } else if (dataset.nav) {
    goTo(addMonths(open.focus, Number(dataset.nav)));
  } else if (dataset.mode === 'months') {
    open.mode = 'months';
    render();
    focusDay();
  } else if (dataset.year) {
    open.view.year += Number(dataset.year);
    render();
  } else if (dataset.month) {
    open.mode = 'days';
    const month = Number(dataset.month);
    const last = new Date(open.view.year, month + 1, 0).getDate();
    goTo({ year: open.view.year, month, day: Math.min(open.focus.day, last) });
  } else if ('pickToday' in dataset) {
    choose(today());
  } else if ('clear' in dataset) {
    open.input.value = '';
    open.input.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  } else if ('close' in dataset) {
    close();
  }
}

function onKey(event: KeyboardEvent): void {
  if (!open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key === 'Tab') {
    // Keep focus inside while open; Esc or a choice closes it.
    const items = [...popover!.querySelectorAll<HTMLButtonElement>('button:not([disabled])')].filter(
      (b) => b.tabIndex !== -1,
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
    return;
  }
  if (open.mode !== 'days' || !(event.target as HTMLElement).dataset.iso) return;
  const moves: Record<string, () => Day> = {
    ArrowLeft: () => addDays(open!.focus, -1),
    ArrowRight: () => addDays(open!.focus, 1),
    ArrowUp: () => addDays(open!.focus, -7),
    ArrowDown: () => addDays(open!.focus, 7),
    PageUp: () => addMonths(open!.focus, event.shiftKey ? -12 : -1),
    PageDown: () => addMonths(open!.focus, event.shiftKey ? 12 : 1),
    Home: () => addDays(open!.focus, -new Date(open!.focus.year, open!.focus.month, open!.focus.day).getDay()),
    End: () => addDays(open!.focus, 6 - new Date(open!.focus.year, open!.focus.month, open!.focus.day).getDay()),
  };
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  goTo(move());
}
