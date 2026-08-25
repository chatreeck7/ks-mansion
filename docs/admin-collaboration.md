# Admin collaboration rules — Sheets vs the console (KS-56)

**Status**: Rules adopted. **The sheet-side protections in "Applying this" are
not yet applied** — they need someone with edit access to `KS_Mansion_DB`.
**Date**: 2026-08-25

Direct sheet access is the *point* of choosing Sheets
([0001](decisions/0001-sheets-over-postgres.md)) — admins can work without
waiting for the console to be finished. Unrestricted access is also the main
way this breaks. This draws the line.

Builds on [sheet-schema.md](sheet-schema.md), which defines the shape; this
defines who may change what.

## This stopped being hypothetical today

`KS_Mansion_DB` is now the **production registry** — `/console/rooms` reads it
live on every request. Earlier notes on this task said protections weren't
urgent "while it's a working file rather than the production registry." That
qualifier expired on 2026-08-25 when KS-2 and KS-7 landed.

Two real incidents, both on this sheet, both from ordinary hand-editing:

1. **A paste silently duplicated every row** — every `room_number` appeared
   twice. Nothing errored; caught only by reading back and counting.
2. **Adding the `id` and `floor` columns took two attempts.** The first added
   a single column *named* `id` but *containing* floor values — so there was
   no `floor` column at all, and all 25 units shared id `1`/`2`/`3`. Caught
   before deploy only because the repository validates on read and refused to
   parse (`missing required column "floor"`). Without that check the console
   would have served every unit under a handful of duplicate identities.

Neither was carelessness. Both are what a spreadsheet invites: it looks like
a document, but it is now a database with a contract.

## Who owns what — `rooms` tab

The console **reads and writes** this tab as of KS-66 — the Sheets client is
scoped `spreadsheets`, and the share with the service account must therefore
be **Editor**, not Viewer, or every write fails with a 403.

Every column is still admin-editable; the console is a second writer, not the
owner. Two guarantees make that safe, and they are worth knowing because they
are what let you keep editing the sheet by hand:

- **The console never blanks a column it does not model.** An update carries
  `type`, `detail` and anything else you add across unchanged. It writes the
  whole row, but only the cells it owns actually change.
- **The console never writes a row it could not read back.** Every write is
  parsed with the read path's own parser first; if it would fail validation,
  nothing is written. A bad save is refused rather than left in the sheet for
  the next page load to choke on.

What it cannot protect against is a simultaneous edit — see "What this does
not solve" at the end.

| Column | Owner | Hand-edit? | Notes |
|---|---|---|---|
| `id` | **Console** | **No** | Stable identity. Changing one silently repoints every reference to that room. Generated on write once the console writes. |
| `room_number` | Admin | Yes | The human label. Safe to correct. |
| `kind` | Admin | Yes | Exactly `unit` or `common` — anything else fails the read. |
| `rent_rate` | Admin | Yes | Monthly **rent**, not a month's bill. **Blank means "no rate on record"** and is meaningful — do not fill it with 0 to tidy up. |
| `floor` | Admin | Yes | Integer 0–3. |
| `hasMeter` | Admin | Yes | Exactly `TRUE` or `FALSE`. |
| `detail` | Admin | Yes | Display name where `room_number` is a slug (`laundry` → ร้านซักผ้า). |
| `status` | Shared | Yes | `occupied`, `noticeGiven`, `available`, `maintenance`. Read *and written* by the console. |
| `has_tv` / `has_fridge` / `has_aircon` | Admin | Yes | `TRUE`, `FALSE`, or blank. Blank means "not on file" — see below. |
| `type` | Admin | Yes | **Not read by the console**, and preserved across every write. AC/FAN. Overlaps `has_aircon`; see the warning below. |
| `archived` | Console | Prefer not | Soft delete (rule 7). Blank or `FALSE` means active. Set by the console's archive action; editing it by hand un-deletes a record. |

**The header row is a contract.** Columns are resolved by name, so they may be
reordered freely — but renaming or deleting one breaks the read. `hasMeter` is
case-sensitive.

**`rent_rate` was called `price`, and held the wrong thing.** It was populated
from แบบฟอร์มเก็บเงินค่าห้อง's `ค่าห้องฯ` column, which is a *month's total* —
rent plus water plus electricity — so it moved every month. Room 101 read
2,636 where the rent is 2,200. The column now holds rent alone and is named
for it.

**Blank ≠ zero, and blank ≠ no.** ห้องเช่าส่วนกลาง has no rent on record; the
console renders an em dash. Filling it with `0` would assert "this space is
free", which is a different and false claim. The appliance columns carry the
same distinction as a third state: a blank `has_tv` reads as **"not on file"**
and shows as an em dash, which is not the same as `FALSE`. Leave them blank
until someone has actually checked — an invented `FALSE` would print on the
month-end report as fact.

`hasMeter` is the exception that proves it: a blank there **does** fail the
read, because a room missing from the meter round is a billing problem, where
an unsurveyed fridge is not.

**`type` and `has_aircon` now say the same thing.** Two cells that can
disagree about one fact is the failure this whole document guards against —
so treat `has_aircon` as the real one, and either retire `type` or keep it
strictly as a marketing label nothing reads.

**`noticeGiven` (แจ้งออก) is a real state, not a nicety.** A room that has
given notice is billed utilities but **no rent** — the `Utility` value in the
monthly report's `จะได้รับ ณ สิ้นเดือน` column. Set it when notice is given
and back to `occupied` when the room is re-let.

## Applying this — needs someone with edit access

None of this can be done from the repo; there is no API access here that
writes sheet structure. In Google Sheets:

### 0. Share with the service account as Editor
Writes need it. A Viewer share reads fine and then fails every save with a
403 — the console's error says so explicitly, but it is a confusing state to
discover mid-edit.

### 1. Protect the header row and the `id` column
Select row 1 → right-click → **View more cell actions → Protect range** →
*Restrict who can edit* → **Only you**. Repeat for the whole `id` column.

Protecting only these two is deliberate: everything else is meant to be
edited, and over-protecting pushes people into copies, which is worse.

### 2. Data validation on the constrained columns
**Data → Data validation**, per column:

| Column | Rule |
|---|---|
| `kind` | Dropdown: `unit`, `common` — **Reject input** |
| `hasMeter` | Dropdown: `TRUE`, `FALSE` — **Reject input** |
| `has_tv` / `has_fridge` / `has_aircon` | Dropdown: `TRUE`, `FALSE` — allow blank |
| `floor` | Number between 0 and 3 — **Reject input** |
| `rent_rate` | Number ≥ 0 — **Reject input** |
| `status` | Dropdown: `occupied`, `noticeGiven`, `available`, `maintenance` — **Reject input** |
| `type` | Dropdown: `AC`, `FAN` |

Use **Reject input**, not "Show warning", everywhere except `type` (which
nothing reads). A warning that can be dismissed does not prevent a bad read;
it just moves the failure to the console.

**Do not number-format `rent_rate` if you can avoid it.** Sheets returns the
*formatted* value, so a thousands separator arrives as the literal `"2,200"`.
The console strips separators, so this is safe today — but it is one more
thing that has to keep working, and a plain number needs nothing stripped.

### 3. A note in the sheet itself
Add a `README` tab, since a rule nobody sees is not a rule:

> This sheet is read live by the KS Mansion console on every page load.
> Editing it changes what the console shows immediately — there is no
> deploy step and no staging copy.
>
> - Do not edit the header row or the `id` column.
> - A blank `rent_rate` means "no rate on record", not zero. Leave it blank.
>   It is **rent only** — not rent plus water and electricity.
> - `kind` must be `unit` or `common`; `hasMeter` must be `TRUE` or `FALSE`
>   and must not be left blank.
> - The `has_*` appliance columns may be left blank — blank means "not on
>   file", which is not the same as `FALSE`. Do not fill them with guesses.
> - `id_card_last4` on the tenants tab holds **four digits only**. Never paste
>   a full national ID there — the console will refuse to read the row.
> - Never re-number the `id` column. Those are identities, not row numbers.
> - Made a mess? **File → Version history → See version history** and
>   restore. That is the undo, and it goes back further than Ctrl-Z.

### 4. Dates — the พ.ศ. trap, now live on the `leases` tab
The `leases` tab has three date columns — `start_date`, `end_date`,
`signed_date` — so this is no longer hypothetical: an admin typing `2026`
where the console expects a Buddhist year gets 1483 CE.

**Format those three columns as plain text** (Format → Number → Plain text).
Left on automatic, Sheets reads `1 ม.ค. 2568` as a date it does not
understand, or silently rewrites what is typed.

Two halves, already handled differently:
- **Display** is solved — `src/lib/format/thai.ts` formats พ.ศ. correctly.
- **Input** is now solved app-side too — `parseThaiDate`
  (`src/lib/format/thai-parse.ts`, KS-6) **rejects** a Gregorian year rather
  than reinterpreting it, and refuses dates that do not exist.

But that only protects input typed *into the console*. For a date column
edited directly in the sheet, Sheets cannot validate "is this a Buddhist
year", so the control is the header text plus the plain-text formatting —
the console's own read is the backstop, and it fails the row rather than
guessing.

## Rules that outlive this tab

For every future entity tab (`tenants`, `leases`, `bills`, …):

1. **Protect the header row and every ID column.** Non-negotiable — these are
   the two things that silently break everything downstream.
2. **Reject, don't warn**, wherever a value must be one of a fixed set.
3. **Append-only tabs get a louder note.** `bills` and `meter_readings` are
   history: a correction is a new row, never an edit to an old one
   ([sheet-schema.md](sheet-schema.md) rule 6). That is a convention no
   spreadsheet feature enforces, so it has to be written where people look.
4. **Version history is the undo, and only works if people know.** Say so in
   the README tab, not just here.

## What this does not solve

- **Concurrent edits.** The Sheets API has no transactions and no
  compare-and-swap ([data-layer.md](data-layer.md#4-write-safety)). An admin
  editing a row while the console writes it can lose one of the two changes.
  Not a problem at single-admin scale; revisit before a second person edits
  routinely.
- **Protected ranges are not security.** Anyone with edit access can unprotect
  a range. This prevents *accidents*, not a determined edit. The real access
  boundary is Drive sharing.
- **Validation only applies to new input.** Adding a rule does not re-check
  existing cells. Worth reading the sheet back once after applying the rules
  above — which is how both incidents at the top of this page were caught.
