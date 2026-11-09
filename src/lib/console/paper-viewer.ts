import { Previewer } from 'pagedjs';
import { paperStylesheet } from './paper';

/**
 * The console's document viewer (owner, 9 พ.ย. 2569: "make the screen look
 * like the print preview" — A4 sheets, the real margins and header/footer,
 * two bills to a page — and turn pages left/right like an e-book rather
 * than scroll down).
 *
 * Paged.js lays the document out into A4 page boxes from `paper.ts`, so
 * what is on screen is exactly what prints. This then shows those pages one
 * at a time in a horizontal track: ‹ › buttons, arrow keys, swipe, a page
 * counter, a "ทุกหน้า" overview, and zoom-to-fit. Printing prints the same
 * page boxes.
 *
 * Without script, or if pagination fails, the document stays as plain
 * HTML underneath and still prints.
 */

export async function mountPaperViewer(root: HTMLElement): Promise<void> {
  const source = root.querySelector<HTMLElement>('[data-paper-source]');
  const track = root.querySelector<HTMLElement>('[data-paper-track]');
  const status = root.querySelector<HTMLElement>('[data-paper-status]');
  if (!source || !track) return;

  const css = paperStylesheet(root.dataset.paperHeader ?? '');
  // The source wrapper itself goes in, so its sheet class (paper-tenant,
  // paper-half) names the sheet from the first page.
  const fragment = document.createDocumentFragment();
  const copy = source.cloneNode(true) as HTMLElement;
  copy.classList.remove('paper-source-pending', 'mx-auto', 'max-w-4xl', 'px-6', 'py-6');
  copy.removeAttribute('data-paper-source');
  fragment.append(copy);

  try {
    const previewer = new Previewer();
    await previewer.preview(fragment, [{ [location.href]: css }], track);
  } catch (error) {
    console.error('paper viewer: pagination failed', error);
    if (status) status.textContent = 'จัดหน้ากระดาษไม่สำเร็จ — แสดงแบบเลื่อนลงแทน พิมพ์ได้ตามปกติ';
    source.classList.remove('paper-source-pending');
    track.remove();
    return;
  }

  // The printer reads the document itself with Chrome's own paged media (see
  // PrintShell), so Paged.js's page rules must not leak into print.
  for (const style of document.querySelectorAll<HTMLStyleElement>('style[data-pagedjs-inserted-styles]')) {
    style.textContent = stripPageRules(style.textContent ?? '');
  }
  root.classList.add('paper-ready');
  setup(root, track);
}

function setup(root: HTMLElement, track: HTMLElement): void {
  const pagesEl = track.querySelector<HTMLElement>('.pagedjs_pages');
  const pages = [...track.querySelectorAll<HTMLElement>('.pagedjs_page')];
  const counter = root.querySelector<HTMLInputElement>('[data-paper-page]');
  const total = root.querySelector<HTMLElement>('[data-paper-total]');
  const prev = root.querySelector<HTMLButtonElement>('[data-paper-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-paper-next]');
  const grid = root.querySelector<HTMLButtonElement>('[data-paper-grid]');
  const zoomButton = root.querySelector<HTMLButtonElement>('[data-paper-zoom]');
  if (!pagesEl || pages.length === 0) return;
  if (total) total.textContent = String(pages.length);
  if (counter) counter.max = String(pages.length);

  let current = 0;
  let overview = false;
  let wide = false;

  const naturalWidth = Math.max(...pages.map((p) => p.offsetWidth));
  const naturalHeight = Math.max(...pages.map((p) => p.offsetHeight));

  const fit = () => {
    if (overview) {
      const perRow = window.innerWidth < 640 ? 2 : 4;
      const zoom = (track.clientWidth - 48) / (perRow * (naturalWidth + 24));
      pagesEl.style.zoom = String(Math.min(0.5, zoom));
      return;
    }
    const top = track.getBoundingClientRect().top;
    const height = Math.max(240, window.innerHeight - top - 24);
    const width = track.clientWidth - (window.innerWidth < 640 ? 16 : 96);
    // ขยายเต็มความกว้าง: the sheet as wide as the window, read by scrolling
    // down inside it; otherwise the whole sheet fits on screen.
    track.style.height = wide ? `${height}px` : '';
    pagesEl.style.zoom = String(wide ? Math.min(1.6, width / naturalWidth) : Math.min(1.25, width / naturalWidth, height / naturalHeight));
  };

  const show = (index: number, smooth = true) => {
    current = Math.max(0, Math.min(pages.length - 1, index));
    if (counter) counter.value = String(current + 1);
    if (prev) prev.disabled = current === 0;
    if (next) next.disabled = current === pages.length - 1;
    if (!overview) pages[current]!.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', inline: 'center', block: 'nearest' });
  };

  // Which page is in the middle after a swipe or a trackpad scroll.
  let settle = 0;
  track.addEventListener('scroll', () => {
    if (overview) return;
    window.clearTimeout(settle);
    settle = window.setTimeout(() => {
      const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
      let best = 0;
      let distance = Infinity;
      pages.forEach((page, i) => {
        const r = page.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < distance) {
          distance = d;
          best = i;
        }
      });
      if (best !== current) {
        current = best;
        if (counter) counter.value = String(current + 1);
        if (prev) prev.disabled = current === 0;
        if (next) next.disabled = current === pages.length - 1;
      }
    }, 80);
  });

  prev?.addEventListener('click', () => show(current - 1));
  next?.addEventListener('click', () => show(current + 1));
  counter?.addEventListener('change', () => show(Number(counter.value) - 1));
  grid?.addEventListener('click', () => {
    overview = !overview;
    root.classList.toggle('paper-overview', overview);
    grid.setAttribute('aria-pressed', String(overview));
    setLabel(grid, overview ? 'ดูทีละหน้า' : 'ทุกหน้า');
    fit();
    if (!overview) show(current, false);
  });
  zoomButton?.addEventListener('click', () => {
    wide = !wide;
    root.classList.toggle('paper-wide', wide);
    zoomButton.setAttribute('aria-pressed', String(wide));
    setLabel(zoomButton, wide ? 'พอดีหน้า' : 'ขยายเต็มความกว้าง');
    fit();
    show(current, false);
  });
  pages.forEach((page, i) =>
    page.addEventListener('click', () => {
      if (!overview) return;
      grid?.click();
      show(i, false);
    }),
  );
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [role=listbox], [role=dialog]')) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      show(current + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      show(current - 1);
    } else if (event.key === 'Home') {
      show(0);
    } else if (event.key === 'End') {
      show(pages.length - 1);
    }
  });
  window.addEventListener('resize', () => {
    fit();
    show(current, false);
  });
  fit();
  show(0, false);
}

/** Removes every `@page …{…}` rule (with nested margin boxes) from a stylesheet. */
export function stripPageRules(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf('@page', i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    const open = css.indexOf('{', at);
    if (open === -1) break;
    let depth = 0;
    let j = open;
    for (; j < css.length; j += 1) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i = j + 1;
  }
  return out;
}

function setLabel(button: HTMLElement, text: string): void {
  button.setAttribute('aria-label', text);
  const label = button.querySelector('[data-label]');
  if (label) label.textContent = text;
}
