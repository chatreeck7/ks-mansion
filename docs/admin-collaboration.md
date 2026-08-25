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

The console **reads** this tab and does not yet write to it (the Sheets client
is scoped `spreadsheets.readonly`). So today every column is admin-editable in
practice, and the rules below are about what is *safe*, enforced by
convention plus the protections in the next section.

| Column | Owner | Hand-edit? | Notes |
|---|---|---|---|
| `id` | **Console** | **No** | Stable identity. Changing one silently repoints every reference to that room. Generated on write once the console writes. |
| `room_number` | Admin | Yes | The human label. Safe to correct. |
| `kind` | Admin | Yes | Exactly `unit` or `common` — anything else fails the read. |
| `price` | Admin | Yes | Monthly rent. **Blank means "no rate on record"** and is meaningful — do not fill it with 0 to tidy up. |
| `floor` | Admin | Yes | Integer 0–3. |
| `hasMeter` | Admin | Yes | Exactly `TRUE` or `FALSE`. |
| `detail` | Admin | Yes | Display name where `room_number` is a slug (`laundry` → ร้านซักผ้า). |
| `status` | Admin | Yes | **Not read by the console yet** — occupancy is KS-8. Admin bookkeeping for now. |
| `type` | Admin | Yes | **Not read by the console yet.** AC/FAN. Admin bookkeeping. |

**The header row is a contract.** Columns are resolved by name, so they may be
reordered freely — but renaming or deleting one breaks the read. `hasMeter` is
case-sensitive.

**Blank ≠ zero.** Rooms 206, 305, 310 and ห้องเช่าส่วนกลาง have no rent on
record. The console renders an em dash. Filling those with `0` would assert
"this room is free", which is a different and false claim.

## Applying this — needs someone with edit access

None of this can be done from the repo; there is no API access here that
writes sheet structure. In Google Sheets:

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
| `floor` | Number between 0 and 3 — **Reject input** |
| `price` | Number ≥ 0 — **Reject input** |
| `status` | Dropdown: `occupied`, `maintenance`, `available` |
| `type` | Dropdown: `AC`, `FAN` |

Use **Reject input**, not "Show warning", on the first four. A warning that
can be dismissed does not prevent a bad read; it just moves the failure to
the console.

### 3. A note in the sheet itself
Add a `README` tab, since a rule nobody sees is not a rule:

> This sheet is read live by the KS Mansion console on every page load.
> Editing it changes what the console shows immediately — there is no
> deploy step and no staging copy.
>
> - Do not edit the header row or the `id` column.
> - A blank `price` means "no rate on record", not zero. Leave it blank.
> - `kind` must be `unit` or `common`; `hasMeter` must be `TRUE` or `FALSE`.
> - Never re-number the `id` column. Those are identities, not row numbers.
> - Made a mess? **File → Version history → See version history** and
>   restore. That is the undo, and it goes back further than Ctrl-Z.

### 4. Dates — the พ.ศ. trap, for when date columns arrive
No tab has a date column yet. When one does (KS-18 meter readings, KS-21
bills), the risk this task named is real: an admin typing `2026` where the
console expects a Buddhist year gets 1483 CE.

Two halves, already handled differently:
- **Display** is solved — `src/lib/format/thai.ts` formats พ.ศ. correctly.
- **Input** is now solved app-side too — `parseThaiDate`
  (`src/lib/format/thai-parse.ts`, KS-6) **rejects** a Gregorian year rather
  than reinterpreting it, and refuses dates that do not exist.

But that only protects input typed *into the console*. For a date column
edited directly in the sheet, set validation to **Date** and put the expected
form in the column header itself (e.g. `read_date (พ.ศ. — 1 มี.ค. 2568)`).
Sheets cannot validate "is this a Buddhist year", so the header text is the
control.

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
