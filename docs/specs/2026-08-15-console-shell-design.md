# Console Shell — Design Spec

**Date**: 2026-08-15
**Task**: KS-5 (Console shell: nav, layout, shared table/form components)
**Status**: Approved in brainstorm, not yet implemented
**Related**: [0001-sheets-over-postgres.md](../decisions/0001-sheets-over-postgres.md), Notion "KS Mansion Admin Console — Family Project"

---

## What this covers

The layout system for `/console`: the navigation frame, the nine screens Phase 0 +
Phase 1 need, and the shared primitives extracted from them. It does not cover data
modelling, persistence, or any feature logic — those live in their own tasks.

## Decisions settled

| Decision | Choice | Why |
|---|---|---|
| Visual register | Ledger, not admin-panel | The console replaces paper: a collection sheet, a carbon-copy ใบเสร็จ book, a clipboard. Admins can already read that format. |
| Spine | The room | Rooms persist, tenants churn. The paper is organised by room, and the Task #7 registry is rooms. |
| Primary surface | Phone for the meter round, desktop for everything else | The round is 28 repetitions walked through the building; everything else happens at a desk. |
| Language | Thai only | No switcher in `/console`. |
| Connectivity | Online only | Signal is reliable on site. Each reading posts as entered — no offline buffer, no sync state. |
| Front door | `/console` redirects to ห้อง | Nav is always on screen; a page listing the same links teaches nothing. |
| Dashboard | Out of scope | Deferred to Task #29, once there is real data to know what is worth surfacing. |

## The frame

Five sections — ห้อง, ผู้เช่า, จดมิเตอร์, บิล, เอกสาร — identical in both layouts.

- **Desktop**: persistent left rail. Active section marked with a gold left border.
- **Phone**: bottom bar holding the three most-used sections plus an overflow entry,
  within thumb reach. Follows the precedent already in
  `src/components/Navigation.astro` on the public site.
- **Meter round**: navigation is hidden entirely. One explicit exit. Chrome in the thumb
  zone during a 28-room one-handed flow invites mis-taps out of the round.

The rail renders only sections that exist. Phase 2 sections (ทรัพย์สิน, ซ่อมบำรุง,
บันทึก) are absent until built — no disabled placeholders, which make a young tool feel
broken.

## Screens

Nine screens across five sections.

### ห้อง — the spine

**Room list** (landing screen). Ledger grouped by floor in walking order, which is also
meter-round order. Columns: room, occupant, meter, this cycle's amount, status. Common
spaces group last and read differently — `ไม่คิดค่าเช่า` in place of an amount, a muted
badge in place of a tenancy status.

**Room detail** (keystone). Header block — number, floor, type, rate, current occupant —
then ruled sections stacked: current lease · meter history · recent bills · move-in/out
log.

**No tabs on this screen.** It is a reference view opened to compare the lease against
the meter history against what is owed. Tabs hide exactly what the screen exists to
cross-check. The cost is a long scroll on a phone, accepted deliberately.

### ผู้เช่า — secondary index

**Tenant list**: name, room, occupation tag, lease end.
**Tenant detail**: profile, guarantor, occupation tag, evaluation, and lease history
across rooms. Every room reference links back to the spine.

### จดมิเตอร์ — the round

Phone-first, full screen, no navigation. Rooms presented in walking order.

Three states:

1. **Entry** — room number, previous reading, a large numeric field, computed usage, and
   a progress count. `ถัดไป` is the primary action; `ข้าม` sits beside it, quieter,
   because skipping is the exception.
2. **Sweep (เก็บตก)** — after the last room, the round returns to whatever was skipped,
   showing when each was skipped and how many remain.
3. **Close** — the round commits only when every room is read or explicitly resolved.

A desktop equivalent exists as a keyboard grid (tab down the rooms), because corrections
happen at a desk rather than in a stairwell.

### บิล

**Cycle list**: past cycles with issued and collected counts.
**Bill detail**: rent + electricity + water + total, due date, transfer instructions.
Printable.
**Collection sheet**: rooms down the left, days across, covering the 26→10 window — the
most literal paper replacement in the console. The room column stays pinned while days
scroll horizontally; the due date column is shaded so the deadline reads without counting
columns.

### เอกสาร

Pick a document type (ใบเสร็จ / สัญญาเช่า / รายงานประจำเดือน / ส่งบัญชี) and a period,
generate, and list what has been generated. A generator, not an archive to browse.

## Design tokens

The console extends the marketing site's tokens rather than replacing them — same brand,
different register.

**Inherited**: `#2c2c2c` as primary ink, `#8b7355` as structural rule, `#d4af37` as
accent.

**Changed for the console**:

- **Gold is not a text colour.** `#d4af37` measures roughly 2:1 against white, far below
  the 4.5:1 needed for body text. In the console it appears only as rules, active-state
  marks, and section borders.
- **Typography is Sarabun**, not Google Sans. It carries full Thai coverage and shares
  its name and feel with the typeface Thai official paperwork is set in, so generated
  receipts and contracts read as correct documents to a Thai reader. Whether the current
  Google Sans request serves any Thai subset at all is unverified and worth checking
  while making this change.
- **Every figure uses `font-variant-numeric: tabular-nums`.** Aligned columns are what
  make a ledger scannable and errors visible.
- **Semantic status colours are separate from the accent**: green (จ่ายแล้ว), amber
  (ค้าง), red (รอจดมิเตอร์), blue (ว่าง), neutral (ส่วนกลาง). Starting values are
  `#45704f`, `#96591b`, `#9c372b`, `#3c5f7d`; each needs contrast verification against
  both grounds during implementation.
- **Density replaces the marketing scale.** The public site's `py-20 md:py-28` sections
  and `text-5xl` headings do not belong in a data tool.
- **Buttons drop `uppercase tracking-widest`.** Wide letter-spacing degrades Thai, which
  relies on tight glyph clusters, and `uppercase` does nothing to Thai text.

## Shared primitives

Extracted from the screens above rather than designed speculatively.

| Primitive | Used by | Notes |
|---|---|---|
| Ledger table | Room list, tenant list, cycle list, collection sheet, meter grid | Floor grouping, pinned first column, tabular figures, em-dash empty states |
| Detail sheet | Room detail, bill detail, tenant detail | Header block plus stacked ruled sections |
| Status pill | Room list, cycle list, bill detail | Five semantic states, never gold |
| Stepper flow | The meter round | The only phone-first primitive |
| Figure field | Meter entry, water entry, rate config | Numeric keypad, large target, previous-value context |

## Out of scope

Dashboard (Task #29), offline buffering, multi-property, payment processing, any Phase 2
section, and the public marketing site's own layout.

## Dependencies and open items

- **Hosting is unresolved and blocks this.** `/console` needs SSR for server-side Sheets
  credentials and admin auth; the site is currently `output: 'static'` on GitHub Pages.
  Recommendation is `output: 'server'` with the Cloudflare adapter and the marketing
  pages marked `export const prerender = true` — one repo, one component library. That
  drops GitHub Pages and the `base: '/ks-mansion'` path, which in turn requires cleaning
  the hardcoded `'/ks-mansion'` strings in `src/i18n/utils.ts`. Belongs to Task #57.

- **Common spaces break the billing engine as currently specced.** ร้านซักผ้า and
  ห้องใต้ถุน are in the Task #7 registry but are not lettable. Task #21 generates a bill
  per room and Task #18 reads a meter per room. The model must separate lettable units
  from common spaces — the laundry has a meter worth tracking and both need Phase 2
  maintenance records, so exclusion is not the answer. This is a Task #1 decision.

- **Thai labels in the mockups are inferred**, not taken from the existing sheets. The
  console's vocabulary should match the words already on the paper. Deferred by decision;
  correct before Phase 1 ships.

- **The public site already reads this Sheet.** `src/components/react/RoomStatus.tsx`
  fetches a Google Apps Script endpoint client-side with a hardcoded URL. It predates the
  repository-interface rule and sits outside `/console`, but Task #52's spike should start
  by reading it, and Task #50 will eventually need the two paths reconciled.
