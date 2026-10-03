# Console design system — "สมุดประจำเดือน" (the monthly logbook)

**Status**: Implemented (Oct 2026). Source: Claude Design handoff, direction 1b + building view
(`KS Console Logbook.dc.html`). Supersedes the visual sections of
[specs/2026-08-15-console-shell-design.md](specs/2026-08-15-console-shell-design.md); that spec's
decisions about data, routes and behaviour still stand.

The console looks like the paper it replaces: a notebook with a page for each month. The month is
six steps you work through, and the building is the room register. Every screen uses the same marks
for status.

## Tokens (`tailwind.config.mjs`)

| Token | Value | Use |
|---|---|---|
| `console-paper` | `#FBF6E9` | Page background |
| `console-spine` | `#F3EDDD` | Sidebar, quiet panels, "already done" asides |
| `console-card` | `#FFFFFF` | Cards, input wells |
| `console-sunk` | `#E6DFCC` | Progress tracks, inactive tabs |
| `console-ink` | `#1E2D4A` | Text, primary buttons, heavy rules |
| `console-ink-soft` / `-faint` | `#4E5566` / `#6B6F78` | Secondary text / placeholders |
| `console-rule` | `#A9BCD0` | Light rule under every ledger line |
| `console-line` / `-strong` | `#DCD2BB` / `#CFC6B3` | Card borders / input borders |
| `console-margin` | `#E7B9B2` | The red margin line (`bg-console-ruled`) |
| `console-highlight` | `#F2DE7C` | The highlighter: current step, active nav, current row |
| `console-ok` (+`-bg`) | `#2D6A4F` | ✓ done |
| `console-crit` (+`-bg`) | `#B0443A` / `#FFF7F4` | ? missing data, problems: the "margin pen" |
| `console-print` | `#8C8073` | Rules on paper documents (bill, receipt, collection sheet) |

Breakpoint **`desk:` = 900px** is the only layout switch: at 900px and wider the spine sidebar shows,
and below that the bottom tab bar does.

**Type**: Sarabun for everything you read. **Mali** (`font-hand`) only for page titles, room numbers,
digits and ticks. **IBM Plex Mono** (`font-figure`) for money and dial figures. Thai needs a Mali
line-height of at least 1.4, because lower values clip tone marks.

## Rules

1. **Marks everywhere**: ✓ done · ○ not yet · ? missing data (dashed red) · — not needed · ½ part-done
   and blocked. See `lib/console/marks.ts` and `Mark.astro`.
2. **Problems are grouped** into one card per reason with one fix (`ProblemCard`, `lib/console/problems.ts`).
   Never one row per problem.
3. **Phone**: text at least 16px (15px for secondary text), taps at least 44px. The billing round is always visible.
4. **No sheet IDs or ticket IDs** in the UI. Say why in plain words.
5. **One primary button per screen.** Variants: `primary`, `secondary`, `ok` (confirm done), `danger`
   (the fix in a problem card), `highlight` (only on the dark ทำต่อ card), `quiet`.
6. **Filters highlight; they never hide** (building view).
7. Missing ("?", nobody recorded it) and absent ("—", recorded as none) must never look alike.

## Components (`src/components/console/`)

| Component | Purpose |
|---|---|
| `ConsoleFrame` | Page shell: spine/tab bar, ruled margin, optional `progress` for spine marks, `width="reading"` |
| `ConsoleNav` | Spine (≥900) + tab bar (<900) from `lib/console-sections.ts` |
| `PageHeader` | Eyebrow ("ขั้น 3 จาก 6"), Mali title, subtitle, back link, `actions` slot |
| `Button` | All buttons and button-links (`lib/console/ui.ts → buttonClass`, shared with React) |
| `Card` | `plain` · `problem` · `spine` · `ink` |
| `ProblemCard` | Grouped problem: title, room chips (each links to its own fix), one action |
| `Chip` | Small tag; `missing` is the dashed "?" chip |
| `Mark` | One logbook mark, with a spoken label |
| `StatTile` | "✓ 16 ออกบิลแล้ว" counts at the top of a step |
| `StepList` | The month's six steps as ruled lines, current one highlighted |
| `RoomTile` | A window of the building (`window` · `compact` · `mini`) |
| `Legend` | Key to marks |
| `FactList` | Label–value rows on dotted rules, with `missing` / `none` tones |
| `SegmentedNav` | Joined link choices |
| `Stepper` | − n + for counts (water occupants), with a plain field underneath |
| `Notice` | One-line "what just happened" message (`ErrorSummary` wraps it) |
| `LedgerTable` | The ruled ledger; a column keyed `room` is drawn in Mali |
| `DetailSheet` / `DetailSection` | Record card with ruled sections (forms, tenant page) |

View-models (pure, tested): `month-progress.ts` (steps, marks, next job), `building.ts` (tile
states), `problems.ts`, `tenant-register.ts`, `keypad.ts` (meter PIN pad), `logbook.ts` (month wording).

## Pages

| Route | Screen |
|---|---|
| `/console` | หน้าสมุด: the ทำต่อ card, six steps, grouped problems, building snapshot (it was a redirect) |
| `/console/meter-round/grid` · `/meter-round` | Step 1. Desk grid · phone round with PIN keypad |
| `/console/water` | Step 2. −/+ occupant steppers |
| `/console/bills` | Step 3. Stat tiles, grouped problem cards, ledger |
| `/console/payments` | Step 4. รับครบ fills the amount; settled rooms move to a side card |
| `/console/collection` | Step 5. A4 sheet on desk, "who hasn't paid" on phone |
| `/console/documents` | Step 6. Tick list, and the form posts straight to the combined print |
| `/console/rooms` | ตึกและห้อง: the building view (`?show=` filter, `?view=list` table) |
| `/console/rooms/:id` | หน้าห้อง: this month's four marks, lease, room facts, bill history |
| `/console/tenants` | ผู้เช่าและสัญญา: missing-lease group first |
| `/console/more` | อื่นๆ: every page, plus log out (phone's fourth tab) |

Forms, the tenant page, health and login use the same primitives. Printable documents keep their
paper layout and only take the type and print-rule tokens.

## Known trade-offs

- **Spine marks only appear where the page already has the figures.** Today that is หน้าสมุด.
  Computing them on every page would cost five uncached sheet reads per request (KS-55).
- **Water has no stored "confirmed" flag.** Step 2 counts as done once bills are issued, because the
  counts are written into the bills at that point.
