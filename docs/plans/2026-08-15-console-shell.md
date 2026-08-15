# Console Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running `/console` showing the room list and room detail, with the nav frame and three shared primitives, built against a repository interface.

**Architecture:** Astro components render everything — no React on these screens, so they ship zero JavaScript. Feature code talks to a `RoomRepository` interface; this plan supplies an in-memory implementation seeded with the real 27-room registry, and the Sheets implementation lands later behind the same interface. The lettable-versus-common-space distinction is enforced by a discriminated union, so the compiler makes it impossible to read a rent rate off the laundry.

**Tech Stack:** Astro 5.16, TypeScript 5.9 (strict), Tailwind 3.4, Vitest (added by Task 1), Astro Container API for component tests.

**Spec:** [docs/specs/2026-08-15-console-shell-design.md](../specs/2026-08-15-console-shell-design.md)

## Global Constraints

- **Repository boundary is absolute.** No file outside `src/lib/repositories/` may import a datastore client or reference sheet/row/column concepts. See `.claude/skills/sheets-backed-feature/SKILL.md`.
- **Stay on `output: 'static'`.** Switching to SSR produces a server bundle GitHub Pages cannot host and breaks the existing deploy. Room detail uses `getStaticPaths` over the repository. The SSR switch belongs to KS-57.
- **Thai only.** No locale switcher, no `en/` variants under `/console`.
- **Gold `#d4af37` is never a text color.** Rules, borders, and active-state marks only.
- **Every figure uses `tabular-nums`.**
- **No greyed-out placeholders.** Nav lists only sections that exist; screens render only data the model actually holds.
- **Buttons and labels never use `uppercase` or `tracking-widest`** — both degrade Thai.
- **`npm run build` must pass** (it runs `astro check`, so type errors fail the build).

## Scope

**In:** KS-3 (console route boundary), KS-5 (token layer, nav frame, layout), KS-58 (primitives), KS-59 (room screens), and the core of KS-6 (Thai date/number formatting).

**Out:** Admin auth (KS-4), Sheets client and schema (KS-2, KS-53), real room seeding (KS-7), meter round (KS-18), and everything in Phase 1.

> **Security note:** `/console` has no authentication until KS-4 lands. Do not deploy it publicly before then. Local development only.

**Fidelity note:** the frame and primitives are built at full fidelity. The room screens render only what the Phase 0 model contains — room, kind, rate, status. Occupant and amount columns arrive with KS-8 and KS-21; lease, meter, and bill sections on room detail arrive with their own cards. Rendering empty sections for data that does not exist yet is the placeholder antipattern this plan avoids.

---

### Task 1: Test harness

Nothing can be tested until this exists. It also de-risks the Astro Container API — if that import name differs in this Astro version, it fails here rather than in Task 6.

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/harness.test.ts`
- Create: `src/components/console/Probe.astro`
- Modify: `package.json` (scripts, devDependencies)

**Interfaces:**
- Produces: `npm test` runs Vitest once; `npm run test:watch` watches.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create the Vitest config**

`getViteConfig` gives Vitest the same resolution Astro uses, so the `@/*` path aliases work in tests.

```ts
// vitest.config.ts
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add test scripts**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create a probe component**

A minimal Astro component whose only job is to prove the Container API renders.

```astro
---
// src/components/console/Probe.astro
interface Props { label: string }
const { label } = Astro.props;
---
<p data-probe>{label}</p>
```

- [ ] **Step 5: Write the failing harness test**

```ts
// src/lib/__tests__/harness.test.ts
import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Probe from '@/components/console/Probe.astro';

describe('test harness', () => {
  it('runs plain TypeScript assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('renders an Astro component to a string', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Probe, { props: { label: 'ok' } });
    expect(html).toContain('data-probe');
    expect(html).toContain('ok');
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: both pass. If the second fails on the import name, check what `astro/container` exports in this version and correct the import — do not proceed until it passes, because six later tasks depend on it.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/__tests__/harness.test.ts src/components/console/Probe.astro
git commit -m "test: add vitest harness with astro container api"
```

---

### Task 2: Room domain model

The lettable-versus-common distinction from KS-1, expressed so the compiler enforces it.

**Files:**
- Create: `src/lib/models/room.ts`
- Create: `src/lib/models/room.test.ts`

**Interfaces:**
- Produces: `Room`, `LettableRoom`, `CommonRoom`, `RoomKind`, `isLettable(room)`, `rentRateOf(room)`, `floorOf(room)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/models/room.test.ts
import { describe, expect, it } from 'vitest';
import { isLettable, rentRateOf, type Room } from './room';

const unit: Room = {
  id: '101', label: '101', floor: 1, kind: 'lettable', rentRate: 2800, hasMeter: true,
};
const laundry: Room = {
  id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common', hasMeter: true,
};

describe('isLettable', () => {
  it('is true for a rentable unit', () => {
    expect(isLettable(unit)).toBe(true);
  });

  it('is false for a common space', () => {
    expect(isLettable(laundry)).toBe(false);
  });
});

describe('rentRateOf', () => {
  it('returns the rate for a lettable unit', () => {
    expect(rentRateOf(unit)).toBe(2800);
  });

  it('returns null for a common space rather than throwing', () => {
    expect(rentRateOf(laundry)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- room`
Expected: FAIL — cannot resolve `./room`.

- [ ] **Step 3: Write the model**

The union is the point: `CommonRoom` has no `rentRate` field at all, so `laundry.rentRate` is a compile error rather than a runtime surprise.

```ts
// src/lib/models/room.ts

/** Whether a room can be rented to a tenant. */
export type RoomKind = 'lettable' | 'common';

interface RoomBase {
  /** Stable identifier used in URLs. */
  id: string;
  /** What the admin calls it: '101', 'ร้านซักผ้า'. */
  label: string;
  /** 1-3 for the residential floors, 0 for ground-level common spaces. */
  floor: number;
  /** Whether an electricity sub-meter is read for this room each cycle. */
  hasMeter: boolean;
}

/** A unit that can be leased. Always has a rent rate. */
export interface LettableRoom extends RoomBase {
  kind: 'lettable';
  rentRate: number;
}

/** A shared space — laundry, undercroft. Never billed rent. */
export interface CommonRoom extends RoomBase {
  kind: 'common';
}

export type Room = LettableRoom | CommonRoom;

export function isLettable(room: Room): room is LettableRoom {
  return room.kind === 'lettable';
}

/** Rent rate, or null for common spaces. Never throws — callers render '—'. */
export function rentRateOf(room: Room): number | null {
  return isLettable(room) ? room.rentRate : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- room`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/models/room.ts src/lib/models/room.test.ts
git commit -m "feat: add room model separating lettable units from common spaces"
```

---

### Task 3: Room repository

The interface every feature talks to, plus an in-memory implementation seeded with the real registry.

**Files:**
- Create: `src/lib/repositories/room-repository.ts`
- Create: `src/lib/repositories/memory/memory-room-repository.ts`
- Create: `src/lib/repositories/memory/memory-room-repository.test.ts`

**Interfaces:**
- Consumes: `Room`, `LettableRoom`, `CommonRoom` from Task 2.
- Produces: `RoomRepository` interface with `listRooms(): Promise<Room[]>` and `getRoom(id: string): Promise<Room | null>`; `createMemoryRoomRepository(rooms?: Room[]): RoomRepository`; `SEED_ROOMS: Room[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/repositories/memory/memory-room-repository.test.ts
import { describe, expect, it } from 'vitest';
import { isLettable } from '@/lib/models/room';
import { createMemoryRoomRepository, SEED_ROOMS } from './memory-room-repository';

describe('SEED_ROOMS', () => {
  it('holds the full registry: 5 + 10 + 10 units and 2 common spaces', () => {
    expect(SEED_ROOMS).toHaveLength(27);
    expect(SEED_ROOMS.filter(isLettable)).toHaveLength(25);
  });

  it('gives every lettable unit a positive rent rate', () => {
    for (const room of SEED_ROOMS.filter(isLettable)) {
      expect(room.rentRate).toBeGreaterThan(0);
    }
  });

  it('includes the laundry as a metered common space', () => {
    const laundry = SEED_ROOMS.find((r) => r.id === 'laundry');
    expect(laundry?.kind).toBe('common');
    expect(laundry?.hasMeter).toBe(true);
  });
});

describe('createMemoryRoomRepository', () => {
  it('lists every seeded room', async () => {
    const repo = createMemoryRoomRepository();
    expect(await repo.listRooms()).toHaveLength(27);
  });

  it('finds a room by id', async () => {
    const repo = createMemoryRoomRepository();
    expect((await repo.getRoom('203'))?.label).toBe('203');
  });

  it('returns null for an unknown id', async () => {
    const repo = createMemoryRoomRepository();
    expect(await repo.getRoom('999')).toBeNull();
  });

  it('accepts an explicit room list for tests', async () => {
    const repo = createMemoryRoomRepository([
      { id: '101', label: '101', floor: 1, kind: 'lettable', rentRate: 100, hasMeter: true },
    ]);
    expect(await repo.listRooms()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- memory-room-repository`
Expected: FAIL — cannot resolve `./memory-room-repository`.

- [ ] **Step 3: Write the interface**

```ts
// src/lib/repositories/room-repository.ts
import type { Room } from '@/lib/models/room';

/**
 * Every feature reads rooms through this. Implementations live under
 * src/lib/repositories/<backend>/ and are the only code allowed to know
 * where rooms are actually stored.
 */
export interface RoomRepository {
  listRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | null>;
}
```

- [ ] **Step 4: Write the in-memory implementation**

Rent rates here are fixture values, not the real ones — KS-17 (per-room rent rate config) supplies those, and KS-7 replaces this whole seed with the Sheet.

```ts
// src/lib/repositories/memory/memory-room-repository.ts
import type { Room } from '@/lib/models/room';
import type { RoomRepository } from '../room-repository';

/** Fixture rates. Real values arrive with KS-17. */
const RATE_BY_FLOOR: Record<number, number> = { 1: 2600, 2: 2800, 3: 3000 };

function unit(label: string, floor: number): Room {
  return {
    id: label,
    label,
    floor,
    kind: 'lettable',
    rentRate: RATE_BY_FLOOR[floor] ?? 2600,
    hasMeter: true,
  };
}

/**
 * The registry from KS-7: 101–105, 201–210, 301–310, plus two common spaces.
 * The undercroft has no sub-meter; the laundry does.
 */
export const SEED_ROOMS: Room[] = [
  ...Array.from({ length: 5 }, (_, i) => unit(`10${i + 1}`, 1)),
  ...Array.from({ length: 10 }, (_, i) => unit(`2${String(i + 1).padStart(2, '0')}`, 2)),
  ...Array.from({ length: 10 }, (_, i) => unit(`3${String(i + 1).padStart(2, '0')}`, 3)),
  { id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common', hasMeter: true },
  { id: 'undercroft', label: 'ห้องใต้ถุน', floor: 0, kind: 'common', hasMeter: false },
];

export function createMemoryRoomRepository(rooms: Room[] = SEED_ROOMS): RoomRepository {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  return {
    async listRooms() {
      return [...rooms];
    },
    async getRoom(id: string) {
      return byId.get(id) ?? null;
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- memory-room-repository`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/repositories/
git commit -m "feat: add room repository interface and in-memory implementation"
```

---

### Task 4: Thai formatting

พ.ศ. dates and figures. This is the core of KS-6.

**Files:**
- Create: `src/lib/format/thai.ts`
- Create: `src/lib/format/thai.test.ts`

**Interfaces:**
- Produces: `toBuddhistYear(year)`, `formatThaiDate(date)`, `formatBaht(amount)`, `formatFigure(value)`, `formatUnits(units)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/format/thai.test.ts
import { describe, expect, it } from 'vitest';
import { formatBaht, formatFigure, formatThaiDate, formatUnits, toBuddhistYear } from './thai';

describe('toBuddhistYear', () => {
  it('adds 543 to the Gregorian year', () => {
    expect(toBuddhistYear(2026)).toBe(2569);
    expect(toBuddhistYear(2025)).toBe(2568);
  });
});

describe('formatThaiDate', () => {
  it('formats as day, abbreviated Thai month, Buddhist year', () => {
    expect(formatThaiDate(new Date(2025, 2, 1))).toBe('1 มี.ค. 2568');
  });

  it('handles a two-digit day', () => {
    expect(formatThaiDate(new Date(2026, 7, 26))).toBe('26 ส.ค. 2569');
  });

  it('handles December, the last month index', () => {
    expect(formatThaiDate(new Date(2026, 11, 31))).toBe('31 ธ.ค. 2569');
  });
});

describe('formatBaht', () => {
  it('groups thousands with commas and no decimals', () => {
    expect(formatBaht(3456)).toBe('3,456');
    expect(formatBaht(0)).toBe('0');
  });
});

describe('formatFigure', () => {
  it('renders an em dash for null so empty ledger cells align', () => {
    expect(formatFigure(null)).toBe('—');
  });

  it('renders a grouped number otherwise', () => {
    expect(formatFigure(4182)).toBe('4,182');
  });
});

describe('formatUnits', () => {
  it('appends the Thai unit word', () => {
    expect(formatUnits(108)).toBe('108 หน่วย');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- thai`
Expected: FAIL — cannot resolve `./thai`.

- [ ] **Step 3: Write the formatters**

```ts
// src/lib/format/thai.ts

/** Thai month abbreviations, indexed to match Date.getMonth(). */
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;

/** The Buddhist calendar runs 543 years ahead of the Gregorian one. */
export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + 543;
}

/** '1 มี.ค. 2568'. Reads the date in local time, matching how it was entered. */
export function formatThaiDate(date: Date): string {
  const day = date.getDate();
  const month = THAI_MONTHS_SHORT[date.getMonth()];
  const year = toBuddhistYear(date.getFullYear());
  return `${day} ${month} ${year}`;
}

/** Thousands-grouped, no decimals — satang are not tracked. */
export function formatBaht(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** A ledger figure, or an em dash when there is no value. */
export function formatFigure(value: number | null): string {
  return value === null ? '—' : formatBaht(value);
}

export function formatUnits(units: number): string {
  return `${formatBaht(units)} หน่วย`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- thai`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/
git commit -m "feat: add Thai date and figure formatting"
```

---

### Task 5: Console token layer

Tailwind tokens plus the Sarabun webfont. Verified by a component test asserting the classes survive into rendered HTML.

**Files:**
- Modify: `tailwind.config.mjs`
- Create: `src/layouts/ConsoleLayout.astro`
- Create: `src/layouts/console-layout.test.ts`

**Interfaces:**
- Produces: Tailwind colors prefixed `console-*`, font families `font-console` and `font-figure`; `ConsoleLayout.astro` accepting `{ title: string }` and a default slot.

- [ ] **Step 1: Extend the Tailwind config**

Add inside `theme.extend.colors` in `tailwind.config.mjs`, keeping the existing marketing tokens untouched:

```js
'console-paper': '#f5f4f0',
'console-card': '#fffefb',
'console-sunk': '#ebe8e1',
'console-ink': '#2c2c2c',
'console-ink-soft': '#6b6862',
'console-ink-faint': '#97928a',
'console-rule': '#8b7355',
'console-ok': '#45704f',
'console-ok-bg': '#e6efe8',
'console-warn': '#96591b',
'console-warn-bg': '#f5eadd',
'console-crit': '#9c372b',
'console-crit-bg': '#f6e5e2',
'console-info': '#3c5f7d',
'console-info-bg': '#e4ecf2',
'console-mute-bg': '#eceae5',
```

And inside `theme.extend.fontFamily`:

```js
console: ['Sarabun', 'Noto Sans Thai', 'sans-serif'],
figure: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
```

- [ ] **Step 2: Write the failing test**

```ts
// src/layouts/console-layout.test.ts
import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ConsoleLayout from './ConsoleLayout.astro';

describe('ConsoleLayout', () => {
  it('sets the page title', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleLayout, {
      props: { title: 'ห้อง' },
    });
    expect(html).toContain('<title>ห้อง</title>');
  });

  it('declares Thai as the document language', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleLayout, { props: { title: 'ห้อง' } });
    expect(html).toContain('lang="th"');
  });

  it('applies the console ground and font tokens to the body', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleLayout, { props: { title: 'ห้อง' } });
    expect(html).toContain('bg-console-paper');
    expect(html).toContain('font-console');
  });

  it('keeps the console out of search results', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleLayout, { props: { title: 'ห้อง' } });
    expect(html).toContain('noindex');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- console-layout`
Expected: FAIL — cannot resolve `./ConsoleLayout.astro`.

- [ ] **Step 4: Write the layout**

Separate from `BaseLayout.astro` on purpose — the console shares the brand but not the grid, and the marketing layout carries a language switcher and Google Sans that do not belong here.

```astro
---
// src/layouts/ConsoleLayout.astro
import '../styles/global.css';

interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!DOCTYPE html>
<html lang="th">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>{title}</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body class="bg-console-paper font-console text-console-ink antialiased">
    <slot />
  </body>
</html>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- console-layout`
Expected: PASS (4 tests).

- [ ] **Step 6: Verify the build still passes**

Run: `npm run build`
Expected: succeeds. This proves the Tailwind config edit did not break the marketing site.

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.mjs src/layouts/ConsoleLayout.astro src/layouts/console-layout.test.ts
git commit -m "feat: add console token layer and layout"
```

---

### Task 6: StatusPill primitive

**Files:**
- Create: `src/components/console/StatusPill.astro`
- Create: `src/components/console/status-pill.test.ts`

**Interfaces:**
- Produces: `StatusPill.astro` accepting `{ tone: PillTone; label: string }`; `PillTone = 'ok' | 'warn' | 'crit' | 'info' | 'mute'` exported from `src/lib/models/pill-tone.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/console/status-pill.test.ts
import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import StatusPill from './StatusPill.astro';

describe('StatusPill', () => {
  it('renders its label', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(StatusPill, {
      props: { tone: 'ok', label: 'จ่ายแล้ว' },
    });
    expect(html).toContain('จ่ายแล้ว');
  });

  it('applies the tone colours', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(StatusPill, {
      props: { tone: 'crit', label: 'รอจดมิเตอร์' },
    });
    expect(html).toContain('bg-console-crit-bg');
    expect(html).toContain('text-console-crit');
  });

  it('never uses the gold accent for text', async () => {
    const container = await AstroContainer.create();
    for (const tone of ['ok', 'warn', 'crit', 'info', 'mute'] as const) {
      const html = await container.renderToString(StatusPill, { props: { tone, label: 'x' } });
      expect(html).not.toContain('text-accent');
    }
  });

  it('does not uppercase or wide-track, which degrade Thai', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(StatusPill, {
      props: { tone: 'info', label: 'ว่าง' },
    });
    expect(html).not.toContain('uppercase');
    expect(html).not.toContain('tracking-widest');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- status-pill`
Expected: FAIL — cannot resolve `./StatusPill.astro`.

- [ ] **Step 3: Write the tone type**

```ts
// src/lib/models/pill-tone.ts

/** Semantic status colours. Deliberately separate from the brand accent. */
export type PillTone = 'ok' | 'warn' | 'crit' | 'info' | 'mute';
```

- [ ] **Step 4: Write the component**

Full class strings per tone, never interpolated fragments — Tailwind scans source text, so `bg-console-${tone}-bg` would be purged.

```astro
---
// src/components/console/StatusPill.astro
import type { PillTone } from '@/lib/models/pill-tone';

interface Props {
  tone: PillTone;
  label: string;
}

const { tone, label } = Astro.props;

const TONE_CLASS: Record<PillTone, string> = {
  ok: 'bg-console-ok-bg text-console-ok',
  warn: 'bg-console-warn-bg text-console-warn',
  crit: 'bg-console-crit-bg text-console-crit',
  info: 'bg-console-info-bg text-console-info',
  mute: 'bg-console-mute-bg text-console-ink-soft',
};
---

<span class={`inline-block px-1.5 py-0.5 text-xs font-figure ${TONE_CLASS[tone]}`}>
  {label}
</span>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- status-pill`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/models/pill-tone.ts src/components/console/StatusPill.astro src/components/console/status-pill.test.ts
git commit -m "feat: add StatusPill primitive"
```

---

### Task 7: LedgerTable primitive

The most-used primitive — five screens depend on it. Data-driven rather than slot-driven so grouping and figure alignment stay consistent everywhere.

**Files:**
- Create: `src/lib/models/ledger.ts`
- Create: `src/components/console/LedgerTable.astro`
- Create: `src/components/console/ledger-table.test.ts`

**Interfaces:**
- Consumes: `PillTone` (Task 6), `formatFigure` (Task 4), `StatusPill.astro` (Task 6).
- Produces: `LedgerCell`, `LedgerColumn`, `LedgerRow`, `LedgerGroup` from `src/lib/models/ledger.ts`; `LedgerTable.astro` accepting `{ columns: LedgerColumn[]; groups: LedgerGroup[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/console/ledger-table.test.ts
import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { LedgerColumn, LedgerGroup } from '@/lib/models/ledger';
import LedgerTable from './LedgerTable.astro';

const columns: LedgerColumn[] = [
  { key: 'room', header: 'ห้อง' },
  { key: 'rate', header: 'ค่าเช่า', align: 'right' },
  { key: 'status', header: 'สถานะ' },
];

const groups: LedgerGroup[] = [
  {
    label: 'ชั้น 1',
    rows: [
      {
        id: '101',
        href: '/console/rooms/101',
        cells: {
          room: { kind: 'text', value: '101' },
          rate: { kind: 'figure', value: 2600 },
          status: { kind: 'pill', tone: 'info', label: 'ว่าง' },
        },
      },
      {
        id: 'laundry',
        cells: {
          room: { kind: 'text', value: 'ร้านซักผ้า' },
          rate: { kind: 'figure', value: null },
          status: { kind: 'pill', tone: 'mute', label: 'ส่วนกลาง' },
        },
      },
    ],
  },
];

describe('LedgerTable', () => {
  it('renders column headers', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('ห้อง');
    expect(html).toContain('ค่าเช่า');
  });

  it('renders a group header row', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('ชั้น 1');
  });

  it('renders an em dash for a null figure', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('—');
  });

  it('groups thousands in figures', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('2,600');
  });

  it('aligns figures with tabular numerals', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('tabular-nums');
  });

  it('links a row that has an href', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('href="/console/rooms/101"');
  });

  it('renders a row without an href as plain text', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('ร้านซักผ้า');
    expect(html).not.toContain('href="/console/rooms/laundry"');
  });

  it('scrolls horizontally rather than breaking the page', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('overflow-x-auto');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ledger-table`
Expected: FAIL — cannot resolve `@/lib/models/ledger`.

- [ ] **Step 3: Write the ledger types**

```ts
// src/lib/models/ledger.ts
import type { PillTone } from './pill-tone';

/** One cell. The union keeps figure alignment and empty states consistent. */
export type LedgerCell =
  | { kind: 'text'; value: string; muted?: boolean }
  | { kind: 'figure'; value: number | null }
  | { kind: 'pill'; tone: PillTone; label: string };

export interface LedgerColumn {
  key: string;
  header: string;
  align?: 'left' | 'right';
}

export interface LedgerRow {
  id: string;
  /** When present, the row's first cell links here. */
  href?: string;
  cells: Record<string, LedgerCell>;
}

/** Rows under a heading — floors, cycles, whatever the screen groups by. */
export interface LedgerGroup {
  label: string;
  rows: LedgerRow[];
}
```

- [ ] **Step 4: Write the component**

```astro
---
// src/components/console/LedgerTable.astro
import type { LedgerColumn, LedgerGroup } from '@/lib/models/ledger';
import { formatFigure } from '@/lib/format/thai';
import StatusPill from './StatusPill.astro';

interface Props {
  columns: LedgerColumn[];
  groups: LedgerGroup[];
}

const { columns, groups } = Astro.props;
---

<div class="overflow-x-auto">
  <table class="w-full border-collapse bg-console-card text-sm">
    <thead>
      <tr>
        {columns.map((column) => (
          <th
            scope="col"
            class:list={[
              'border-b border-console-rule/25 px-3 py-2 font-figure text-xs font-semibold text-console-ink-faint',
              column.align === 'right' ? 'text-right' : 'text-left',
            ]}
          >
            {column.header}
          </th>
        ))}
      </tr>
    </thead>
    {groups.map((group) => (
      <tbody>
        <tr>
          <th
            scope="colgroup"
            colspan={columns.length}
            class="border-b border-console-rule/25 bg-console-sunk px-3 py-1.5 text-left font-figure text-xs font-semibold text-console-rule"
          >
            {group.label}
          </th>
        </tr>
        {group.rows.map((row) => (
            <tr class="border-b border-console-rule/10 last:border-b-0">
              {columns.map((column, index) => {
                const cell = row.cells[column.key];
                return (
                  <td
                    class:list={[
                      'px-3 py-2',
                      column.align === 'right' && 'text-right',
                      cell?.kind === 'figure' && 'font-figure tabular-nums',
                    ]}
                  >
                    {cell?.kind === 'figure' && formatFigure(cell.value)}
                    {cell?.kind === 'pill' && <StatusPill tone={cell.tone} label={cell.label} />}
                    {cell?.kind === 'text' && (
                      index === 0 && row.href ? (
                        <a
                          href={row.href}
                          class="font-figure font-semibold text-console-ink underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-rule"
                        >
                          {cell.value}
                        </a>
                      ) : (
                        <span class={cell.muted ? 'text-console-ink-faint' : ''}>{cell.value}</span>
                      )
                    )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    ))}
  </table>
</div>
```

Each group is its own `<tbody>` — valid HTML, semantically correct, and it avoids needing a fragment inside the map.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- ledger-table`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/models/ledger.ts src/components/console/LedgerTable.astro src/components/console/ledger-table.test.ts
git commit -m "feat: add LedgerTable primitive"
```

---

### Task 8: DetailSheet primitive

Header block plus stacked ruled sections. No tabs — the spec is explicit that this screen exists for cross-checking.

**Files:**
- Create: `src/components/console/DetailSheet.astro`
- Create: `src/components/console/DetailSection.astro`
- Create: `src/components/console/detail-sheet.test.ts`

**Interfaces:**
- Produces: `DetailSheet.astro` accepting `{ title: string; meta?: string }` plus a default slot; `DetailSection.astro` accepting `{ heading: string }` plus a default slot.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/console/detail-sheet.test.ts
import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import DetailSheet from './DetailSheet.astro';
import DetailSection from './DetailSection.astro';

describe('DetailSheet', () => {
  it('renders the title', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, { props: { title: '203' } });
    expect(html).toContain('203');
  });

  it('renders optional meta text', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, {
      props: { title: '203', meta: 'ชั้น 2 · ค่าเช่า 2,800' },
    });
    expect(html).toContain('ชั้น 2 · ค่าเช่า 2,800');
  });

  it('marks the header with the gold rule', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, { props: { title: '203' } });
    expect(html).toContain('border-accent');
  });

  it('renders slotted content', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, {
      props: { title: '203' },
      slots: { default: '<p>สัญญา</p>' },
    });
    expect(html).toContain('สัญญา');
  });
});

describe('DetailSection', () => {
  it('renders its heading and content', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSection, {
      props: { heading: 'มิเตอร์ไฟ' },
      slots: { default: '<p>4,182</p>' },
    });
    expect(html).toContain('มิเตอร์ไฟ');
    expect(html).toContain('4,182');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- detail-sheet`
Expected: FAIL — cannot resolve `./DetailSheet.astro`.

- [ ] **Step 3: Write DetailSheet**

```astro
---
// src/components/console/DetailSheet.astro
interface Props {
  title: string;
  meta?: string;
}

const { title, meta } = Astro.props;
---

<article class="border border-console-rule/25 bg-console-card">
  <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-accent px-4 py-3">
    <h1 class="font-figure text-2xl font-semibold tabular-nums">{title}</h1>
    {meta && <p class="text-sm text-console-ink-soft">{meta}</p>}
  </header>
  <slot />
</article>
```

- [ ] **Step 4: Write DetailSection**

```astro
---
// src/components/console/DetailSection.astro
interface Props {
  heading: string;
}

const { heading } = Astro.props;
---

<section class="border-b border-console-rule/10 px-4 py-3 last:border-b-0">
  <h2 class="mb-2 font-figure text-xs font-semibold text-console-rule">{heading}</h2>
  <slot />
</section>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- detail-sheet`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/console/DetailSheet.astro src/components/console/DetailSection.astro src/components/console/detail-sheet.test.ts
git commit -m "feat: add DetailSheet and DetailSection primitives"
```

---

### Task 9: Nav frame

Rail on desktop, bottom bar on phone, from one section list. Only `rooms` exists today; later cards append entries.

**Files:**
- Create: `src/lib/console-sections.ts`
- Create: `src/components/console/ConsoleNav.astro`
- Create: `src/components/console/ConsoleFrame.astro`
- Create: `src/components/console/console-nav.test.ts`

**Interfaces:**
- Consumes: `ConsoleLayout.astro` (Task 5).
- Produces: `CONSOLE_SECTIONS` from `src/lib/console-sections.ts`; `ConsoleFrame.astro` accepting `{ title: string; activeSection: string }` plus a default slot.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/console/console-nav.test.ts
import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { CONSOLE_SECTIONS } from '@/lib/console-sections';
import ConsoleNav from './ConsoleNav.astro';

describe('CONSOLE_SECTIONS', () => {
  it('lists only sections that exist — no placeholders for unbuilt features', () => {
    expect(CONSOLE_SECTIONS.map((s) => s.id)).toEqual(['rooms']);
  });
});

describe('ConsoleNav', () => {
  it('renders every section as a link', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleNav, {
      props: { activeSection: 'rooms' },
    });
    expect(html).toContain('href="/console/rooms"');
    expect(html).toContain('ห้อง');
  });

  it('marks the active section for assistive tech', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleNav, {
      props: { activeSection: 'rooms' },
    });
    expect(html).toContain('aria-current="page"');
  });

  it('renders a desktop rail and a phone bar', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleNav, {
      props: { activeSection: 'rooms' },
    });
    expect(html).toContain('data-console-rail');
    expect(html).toContain('data-console-tabbar');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- console-nav`
Expected: FAIL — cannot resolve `@/lib/console-sections`.

- [ ] **Step 3: Write the section list**

```ts
// src/lib/console-sections.ts

export interface ConsoleSection {
  id: string;
  label: string;
  href: string;
}

/**
 * Only sections that actually exist. Adding a disabled entry for an unbuilt
 * feature makes a young tool feel broken — later cards append here as they land.
 */
export const CONSOLE_SECTIONS: ConsoleSection[] = [
  { id: 'rooms', label: 'ห้อง', href: '/console/rooms' },
];
```

- [ ] **Step 4: Write the nav**

```astro
---
// src/components/console/ConsoleNav.astro
import { CONSOLE_SECTIONS } from '@/lib/console-sections';

interface Props {
  activeSection: string;
}

const { activeSection } = Astro.props;
---

<nav
  data-console-rail
  aria-label="ส่วนต่างๆ"
  class="hidden w-36 shrink-0 flex-col border-r border-console-rule/25 md:flex"
>
  <p class="border-b border-console-rule/25 px-3 py-3 text-sm font-semibold tracking-[0.18em]">KS</p>
  {CONSOLE_SECTIONS.map((section) => (
    <a
      href={section.href}
      aria-current={section.id === activeSection ? 'page' : undefined}
      class:list={[
        'border-l-[3px] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-rule',
        section.id === activeSection
          ? 'border-accent bg-console-sunk font-semibold text-console-ink'
          : 'border-transparent text-console-ink-soft hover:text-console-ink',
      ]}
    >
      {section.label}
    </a>
  ))}
</nav>

<nav
  data-console-tabbar
  aria-label="ส่วนต่างๆ"
  class="fixed inset-x-0 bottom-0 z-50 flex border-t border-console-rule/25 bg-console-card md:hidden"
>
  {CONSOLE_SECTIONS.map((section) => (
    <a
      href={section.href}
      aria-current={section.id === activeSection ? 'page' : undefined}
      class:list={[
        'flex-1 border-t-2 py-3 text-center text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-rule',
        section.id === activeSection
          ? 'border-accent font-semibold text-console-ink'
          : 'border-transparent text-console-ink-soft',
      ]}
    >
      {section.label}
    </a>
  ))}
</nav>
```

- [ ] **Step 5: Write the frame**

`pb-20` on the content well keeps the phone tab bar from covering the last table row.

```astro
---
// src/components/console/ConsoleFrame.astro
import ConsoleLayout from '@/layouts/ConsoleLayout.astro';
import ConsoleNav from './ConsoleNav.astro';

interface Props {
  title: string;
  activeSection: string;
}

const { title, activeSection } = Astro.props;
---

<ConsoleLayout title={title}>
  <div class="flex min-h-screen">
    <ConsoleNav activeSection={activeSection} />
    <main class="min-w-0 flex-1 px-4 py-4 pb-20 md:pb-4">
      <slot />
    </main>
  </div>
</ConsoleLayout>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- console-nav`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/console-sections.ts src/components/console/ConsoleNav.astro src/components/console/ConsoleFrame.astro src/components/console/console-nav.test.ts
git commit -m "feat: add console nav frame"
```

---

### Task 10: Room list page

**Files:**
- Create: `src/lib/console/room-ledger.ts`
- Create: `src/lib/console/room-ledger.test.ts`
- Create: `src/pages/console/rooms/index.astro`

**Interfaces:**
- Consumes: `Room`, `isLettable`, `rentRateOf` (Task 2); `RoomRepository` (Task 3); `LedgerColumn`, `LedgerGroup` (Task 7).
- Produces: `ROOM_COLUMNS: LedgerColumn[]`, `toRoomGroups(rooms: Room[]): LedgerGroup[]`.

The view-model is a plain function so the grouping logic is testable without rendering.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/console/room-ledger.test.ts
import { describe, expect, it } from 'vitest';
import type { Room } from '@/lib/models/room';
import { toRoomGroups } from './room-ledger';

const rooms: Room[] = [
  { id: '101', label: '101', floor: 1, kind: 'lettable', rentRate: 2600, hasMeter: true },
  { id: '201', label: '201', floor: 2, kind: 'lettable', rentRate: 2800, hasMeter: true },
  { id: 'laundry', label: 'ร้านซักผ้า', floor: 1, kind: 'common', hasMeter: true },
  { id: 'undercroft', label: 'ห้องใต้ถุน', floor: 0, kind: 'common', hasMeter: false },
];

describe('toRoomGroups', () => {
  it('groups lettable units by floor, in walking order', () => {
    const groups = toRoomGroups(rooms);
    expect(groups[0].label).toBe('ชั้น 1');
    expect(groups[1].label).toBe('ชั้น 2');
  });

  it('puts common spaces in their own group, last', () => {
    const groups = toRoomGroups(rooms);
    expect(groups.at(-1)?.label).toBe('พื้นที่ส่วนกลาง');
    expect(groups.at(-1)?.rows).toHaveLength(2);
  });

  it('gives lettable units a rent figure and a vacancy pill', () => {
    const row = toRoomGroups(rooms)[0].rows[0];
    expect(row.cells.rate).toEqual({ kind: 'figure', value: 2600 });
    expect(row.cells.status).toEqual({ kind: 'pill', tone: 'info', label: 'ว่าง' });
  });

  it('gives common spaces no rent and a muted pill', () => {
    const commonRow = toRoomGroups(rooms).at(-1)!.rows[0];
    expect(commonRow.cells.rate).toEqual({ kind: 'figure', value: null });
    expect(commonRow.cells.status).toEqual({ kind: 'pill', tone: 'mute', label: 'ส่วนกลาง' });
  });

  it('links every row to its detail page', () => {
    expect(toRoomGroups(rooms)[0].rows[0].href).toBe('/console/rooms/101');
  });

  it('omits an empty floor group entirely', () => {
    const groups = toRoomGroups([rooms[0], rooms[2], rooms[3]]);
    expect(groups.map((g) => g.label)).toEqual(['ชั้น 1', 'พื้นที่ส่วนกลาง']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- room-ledger`
Expected: FAIL — cannot resolve `./room-ledger`.

- [ ] **Step 3: Write the view-model**

Occupant and amount columns are deliberately absent — that data does not exist until KS-8 and KS-21.

```ts
// src/lib/console/room-ledger.ts
import type { LedgerColumn, LedgerGroup, LedgerRow } from '@/lib/models/ledger';
import { isLettable, rentRateOf, type Room } from '@/lib/models/room';

export const ROOM_COLUMNS: LedgerColumn[] = [
  { key: 'room', header: 'ห้อง' },
  { key: 'rate', header: 'ค่าเช่า', align: 'right' },
  { key: 'status', header: 'สถานะ' },
];

function toRow(room: Room): LedgerRow {
  return {
    id: room.id,
    href: `/console/rooms/${room.id}`,
    cells: {
      room: { kind: 'text', value: room.label },
      rate: { kind: 'figure', value: rentRateOf(room) },
      status: isLettable(room)
        ? { kind: 'pill', tone: 'info', label: 'ว่าง' }
        : { kind: 'pill', tone: 'mute', label: 'ส่วนกลาง' },
    },
  };
}

/**
 * Lettable units grouped by floor in walking order — which is also meter-round
 * order — then common spaces last. Empty floors are omitted rather than shown
 * as empty headings.
 */
export function toRoomGroups(rooms: Room[]): LedgerGroup[] {
  const lettable = rooms.filter(isLettable);
  const floors = [...new Set(lettable.map((room) => room.floor))].sort((a, b) => a - b);

  const groups: LedgerGroup[] = floors.map((floor) => ({
    label: `ชั้น ${floor}`,
    rows: lettable
      .filter((room) => room.floor === floor)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(toRow),
  }));

  const common = rooms.filter((room) => !isLettable(room));
  if (common.length > 0) {
    groups.push({ label: 'พื้นที่ส่วนกลาง', rows: common.map(toRow) });
  }

  return groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- room-ledger`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the page**

```astro
---
// src/pages/console/rooms/index.astro
import ConsoleFrame from '@/components/console/ConsoleFrame.astro';
import LedgerTable from '@/components/console/LedgerTable.astro';
import { ROOM_COLUMNS, toRoomGroups } from '@/lib/console/room-ledger';
import { createMemoryRoomRepository } from '@/lib/repositories/memory/memory-room-repository';

const rooms = await createMemoryRoomRepository().listRooms();
const groups = toRoomGroups(rooms);
---

<ConsoleFrame title="ห้อง" activeSection="rooms">
  <LedgerTable columns={ROOM_COLUMNS} groups={groups} />
</ConsoleFrame>
```

- [ ] **Step 6: Verify it renders**

Run: `npm run dev`, open `http://localhost:4321/ks-mansion/console/rooms`
Expected: 25 units in three floor groups, then ร้านซักผ้า and ห้องใต้ถุน under พื้นที่ส่วนกลาง with an em dash for rent. Narrow the window below 768px and confirm the rail is replaced by the bottom bar.

- [ ] **Step 7: Commit**

```bash
git add src/lib/console/ src/pages/console/
git commit -m "feat: add console room list"
```

---

### Task 11: Room detail page and console redirect

**Files:**
- Create: `src/pages/console/rooms/[room].astro`
- Create: `src/pages/console/index.astro`

**Interfaces:**
- Consumes: everything from Tasks 2–9.

- [ ] **Step 1: Write the room detail page**

Only identity data is rendered — lease, meter, and bill sections arrive with their own cards, and `DetailSection` is the extension point.

```astro
---
// src/pages/console/rooms/[room].astro
import ConsoleFrame from '@/components/console/ConsoleFrame.astro';
import DetailSheet from '@/components/console/DetailSheet.astro';
import DetailSection from '@/components/console/DetailSection.astro';
import { formatFigure } from '@/lib/format/thai';
import { isLettable } from '@/lib/models/room';
import { createMemoryRoomRepository } from '@/lib/repositories/memory/memory-room-repository';

export async function getStaticPaths() {
  const rooms = await createMemoryRoomRepository().listRooms();
  return rooms.map((room) => ({ params: { room: room.id }, props: { room } }));
}

const { room } = Astro.props;

const meta = isLettable(room)
  ? `ชั้น ${room.floor} · ค่าเช่า ${formatFigure(room.rentRate)} ต่อเดือน`
  : 'พื้นที่ส่วนกลาง · ไม่คิดค่าเช่า';
---

<ConsoleFrame title={`ห้อง ${room.label}`} activeSection="rooms">
  <DetailSheet title={room.label} meta={meta}>
    <DetailSection heading="ข้อมูลห้อง">
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-console-ink-faint">ประเภท</dt>
        <dd>{isLettable(room) ? 'ห้องให้เช่า' : 'พื้นที่ส่วนกลาง'}</dd>
        <dt class="text-console-ink-faint">มิเตอร์ไฟ</dt>
        <dd>{room.hasMeter ? 'มี' : 'ไม่มี'}</dd>
      </dl>
    </DetailSection>
  </DetailSheet>

  <p class="mt-4">
    <a
      href="/console/rooms"
      class="text-sm text-console-ink-soft underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-rule"
      >← กลับไปรายการห้อง</a
    >
  </p>
</ConsoleFrame>
```

- [ ] **Step 2: Write the console redirect**

A meta refresh because the site is static. This becomes a real 302 via `Astro.redirect` once KS-57 switches to SSR.

```astro
---
// src/pages/console/index.astro
const target = `${import.meta.env.BASE_URL}/console/rooms`.replace(/\/+/g, '/');
---

<!DOCTYPE html>
<html lang="th">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="noindex, nofollow" />
    <meta http-equiv="refresh" content={`0; url=${target}`} />
    <title>ห้อง</title>
  </head>
  <body>
    <a href={target}>ไปที่รายการห้อง</a>
  </body>
</html>
```

- [ ] **Step 3: Verify both render**

Run: `npm run dev`
- Open `/ks-mansion/console` → lands on the room list.
- Open `/ks-mansion/console/rooms/203` → detail sheet with ชั้น 2 and a rent figure.
- Open `/ks-mansion/console/rooms/laundry` → shows พื้นที่ส่วนกลาง · ไม่คิดค่าเช่า and มี for the meter.
- Tab through the room list and confirm focus rings are visible on row links.

- [ ] **Step 4: Run the full suite and build**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds including `astro check`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/console/
git commit -m "feat: add console room detail and index redirect"
```

---

## Definition of done

- `npm test` passes; `npm run build` passes including `astro check`.
- `/console` redirects to the room list; 27 rooms render grouped by floor with common spaces last.
- Room detail renders for every room id, including both common spaces.
- The rail appears at ≥768px and the bottom bar below it.
- No file outside `src/lib/repositories/` references a datastore.
- The marketing site is unchanged — same routes, same rendering, same deploy.

## Follow-ups this plan does not do

| Card | What it adds |
|---|---|
| KS-4 | Admin auth. **`/console` must not be publicly deployed until this lands.** |
| KS-57 | SSR switch, Cloudflare adapter, base-path removal — turns the meta refresh into a real redirect |
| KS-2, KS-53, KS-54, KS-7 | The Sheets-backed `RoomRepository`, replacing the in-memory one behind the same interface |
| KS-8, KS-21 | Occupant and amount columns on the room list; lease and bill sections on room detail |
| KS-18 | Meter round — the stepper flow and figure field, the only phone-first primitives |
| KS-17 | Real per-room rent rates, replacing the fixture values in `SEED_ROOMS` |
