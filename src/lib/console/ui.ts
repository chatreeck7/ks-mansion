/**
 * Class recipes for the console's logbook design system.
 *
 * Kept as plain strings in a `.ts` file rather than only inside `.astro`
 * components, because the meter round is a React island and must draw the
 * same buttons and fields as everything else. One recipe, two renderers — the
 * version that drifted would be the one on the phone, which is the one used
 * standing in a stairwell.
 *
 * Tailwind scans `src/**\/*.ts`, so every class named here is generated.
 * See docs/console-design-system.md for when to use which.
 */

/** Keyboard focus, everywhere. Ink, not the old gold: gold fails contrast. */
export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-console-ink';

export type ButtonVariant = 'primary' | 'secondary' | 'ok' | 'danger' | 'highlight' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold no-underline ' +
  'whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-40';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  /** The one action a screen exists for. Ink on paper. */
  primary: 'bg-console-ink text-white hover:bg-console-ink/90',
  /** A second action beside the primary one. Outlined in ink. */
  secondary:
    'border-[1.5px] border-console-ink bg-transparent text-console-ink hover:bg-console-ink/5',
  /** Confirming something is done: ✓ ยืนยัน, รับครบ. */
  ok: 'bg-console-ok text-white hover:bg-console-ok/90',
  /** The single fix inside a problem card. */
  danger: 'bg-console-crit text-white hover:bg-console-crit/90',
  /** Only on the dark "ทำต่อ" card, where ink-on-ink would vanish. */
  highlight: 'bg-console-highlight text-console-ink hover:brightness-95',
  /** A link-weight action that still needs a 44px target. */
  quiet: 'text-console-ink underline-offset-4 hover:underline',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  /** 44px: the minimum tap target on a phone. */
  md: 'min-h-11 px-4 text-[15px]',
  lg: 'min-h-12 px-5 text-base sm:text-[17px]',
};

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  full = false,
): string {
  return [BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], full ? 'w-full' : '', FOCUS]
    .filter(Boolean)
    .join(' ');
}

/** Text inputs, selects and textareas. 44px tall, ink outline, white well. */
export const INPUT =
  'min-h-11 w-full rounded-lg border-[1.5px] border-console-line-strong bg-console-card px-3 ' +
  'text-console-ink placeholder:text-console-ink-faint ' +
  'focus:border-console-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-console-highlight';

/** An input that is in error. Added to `INPUT`, never instead of it. */
export const INPUT_ERROR = 'border-console-crit';

/** Figures in a field: tabular, monospaced, so columns line up while typing. */
export const INPUT_FIGURE = 'font-figure tabular-nums';

/** A plain text link in running copy. */
export const LINK =
  'text-console-ink underline underline-offset-2 hover:text-console-crit hover:no-underline ' + FOCUS;

/** Small uppercase-free eyebrow above a title: "ขั้น 3 จาก 6". */
export const EYEBROW = 'mb-0 text-sm font-semibold text-console-ink-soft';

/** Section heading inside a page or card. Mali, like a hand-written label. */
export const SECTION_TITLE = 'mb-2 font-hand text-[17px] font-semibold tracking-normal text-console-ink';
