# Data Layer — Sheets Spike Findings (KS-52)

**Status**: Spike complete. Confirms [0001-sheets-over-postgres.md](decisions/0001-sheets-over-postgres.md) holds, with caveats and follow-up work called out below.
**Date**: 2026-08-17

This is the output of Task #52: confirm the Sheets-as-DB approach before building
features on it. Findings below are evidence gathered this session, not vibes —
each item says what was actually measured/checked vs. what's still assumed.

## What already exists in the repo

- `src/lib/repositories/room-repository.ts` — the interface (`listRooms`,
  `getRoom`). `src/lib/repositories/index.ts` is the composition root. Only
  implementation today is `memory/memory-room-repository.ts` — **no
  `src/lib/repositories/sheets/` implementation exists yet**, and `googleapis`
  is not in `package.json`. Wiring the real client is Task #2, not this spike.
- `src/components/react/RoomStatus.tsx` — the marketing site's room-status
  widget. Fetches a **public, unauthenticated Google Apps Script Web App**
  URL client-side. This predates the repository-interface rule and sits
  outside `/console`.
- `astro.config.mjs` is still `output: 'static'` — the SSR adapter switch
  (Task #57) has not landed.

## 1. Auth model

**Recommendation: service account for `/console`, keep the Apps Script
endpoint for the public marketing widget.** Two coexisting patterns, scoped to
two different trust levels:

- `/console` (admin, read+write, behind KS-4 auth) → service account, server-
  side only via the Sheets API v4. Doesn't expire, no admin OAuth consent flow
  to maintain, and doesn't block admins from editing the sheet directly — that
  happens through normal Drive sharing regardless of what auth the console
  uses.
- Public marketing `RoomStatus.tsx` (read-only, no secrets, already shipping)
  → keep the Apps Script Web App as-is. It's a third pattern the original
  checklist didn't name, but replacing it with a service-account-gated read
  wouldn't reduce risk (it's already read-only, publicly-intended data) and
  would add a server round-trip the static marketing page doesn't otherwise
  need.

Checked `KS_Mansion_DB`'s actual Drive permissions: currently **one entry**,
owner `projaisvc@gmail.com`, no other principals. **Provisioning a service
account and sharing the sheet to it is unstarted work**, folded into Task #2,
not yet done by this spike.

Task #50 (public vacancy list) will eventually need these two paths
reconciled — noted in the console-shell design spec, not solved here.

## 2. Quota headroom

Per [Sheets API v4 usage limits](https://developers.google.com/workspace/sheets/api/limits):

| | Per minute / **project** | Per minute / **user** |
|---|---|---|
| Read requests | 300 | 60 |
| Write requests | 300 | 60 |

Single-admin usage means the **60/min/user** ceiling is the one that matters
in practice.

Worst realistic burst — generating ~28 bills in one run, each touching rooms +
leases + meter readings: if built as **whole-tab reads into memory** (rooms,
leases, meters, bills — 4-5 tabs total) plus **batched writes** (all 28 bills'
worth of cells in a handful of `batchUpdate` calls, not one write call per
bill), the run stays in the single digits of requests. Comfortably under 60/min
either direction. The failure mode to avoid is a *chatty per-room* pattern —
28 separate reads + 28 separate writes would still fit under quota today, but
has no headroom left for anything else happening in the same minute (an admin
browsing the console while a bill run executes, for instance). Bill generation
should read tabs once and iterate in memory, matching the pattern the original
checklist asked for.

**2026 billing note**: Google's docs currently state that exceeding quota is
planned to start incurring Cloud billing charges later in 2026 (previously:
just a 429). Not a blocker at family scale, but worth re-checking before
scaling past single-property use (see
[0002-scaling-path-beyond-sheets.md](decisions/0002-scaling-path-beyond-sheets.md)).

## 3. Latency

Measured a real round trip against the actual `KS_Mansion_DB` sheet (28 rows,
7 columns) via the interactive Drive connector available in this session:
**two reads, ~8.2s and ~10.0s wall-clock**.

**Important caveat, same as the one already on this card**: this is *not* the
Sheets API v4 `values.get` the real server code will call. The Drive connector
tool explicitly returns "a natural language representation" of the file — it's
doing format conversion (into a markdown table) server-side, not a raw values
fetch. So this number is not directly usable as the production latency figure.

What it **does** confirm, though: don't assume the "\~300–800ms" figure from
the original checklist without measuring the real client. The two mechanisms
tested so far (Drive connector: ~8-10s; hypothesized raw API: 300-800ms) are
an order of magnitude apart, which is exactly the kind of gap that breaks a
"chatty per-component fetch" design. **This spike does not close this item** —
measuring the actual client against this sheet is follow-up work for whoever
wires Task #2, and should happen before any per-component (rather than
whole-tab) read pattern is considered.

### ✅ Closed 2026-08-25 (KS-2) — the fear did not materialise

The real client is live and `/console/rooms` loads **instantly** against the
production sheet — sub-second, one whole-tab read per render. Owner-observed
rather than stopwatch-measured, so treat it as an order-of-magnitude result,
not a precise figure. That is enough to settle what this item was actually
worried about: the ~8–10s connector number was an artifact of that tool's
format conversion and says nothing about the API.

Two consequences:

- **KS-55 (read caching) is not urgent.** Prioritise it on quota headroom if
  it is ever needed, not on page speed — there is no speed problem to fix.
- The client is **not** `googleapis`, which the note above assumed. That
  package is ~212 MB unpacked against a 64 MB uncompressed Workers ceiling
  and cannot ship at all. It is a dependency-free Web Crypto JWT over
  `fetch` — see `src/lib/repositories/sheets/google-sheets-client.ts`.

The whole-tab-read-into-memory pattern the checklist recommends is the right
call regardless of which latency number turns out to be true — it bounds the
number of round trips to a small constant per page render rather than scaling
with room count.

## 4. Write safety

No transactions in the Sheets API. Per
[the batchUpdate guide](https://developers.google.com/workspace/sheets/api/guides/batchupdate),
changes are grouped so that if one sub-request is unsuccessful, none of the
other (potentially dependent) changes are written — atomic within a single
call. But that atomicity is scoped to a single API call; it does **not**
guard against concurrent edits from elsewhere (an admin with the sheet open,
or two console requests racing). The
[REST reference for `batchUpdate`](https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)
says explicitly: *"it is not guaranteed that the spreadsheet will reflect
exactly your changes after this completes, however it is guaranteed that the
updates in the request will be applied together atomically... Your changes
may be altered with respect to collaborator changes."*

There is no compare-and-swap / optimistic-locking primitive exposed by the
API for this. Practical implication for write code: **use one `batchUpdate`
per logical operation** (e.g., "record this payment" = one call touching
whatever cells that requires), not several sequential calls that could leave
half-applied state if the run dies mid-way. A failed bill run should be safe
to re-run — writes should be structured so re-applying them is idempotent
(write the full row, not "increment this cell"), rather than relying on the
API to tell you what already landed.

**On the anecdote already on this card** (silent duplication/dropped-cells
seen this session via the *interactive* Drive connector): that's a different
mechanism from the Sheets API v4 client and isn't repeated as evidence here.
Deliberately did not re-run destructive write tests against the live
`KS_Mansion_DB` sheet to chase this further — it's real production data for
an occupied building, not a scratch fixture, and reproducing a "does a
partial write ever look successful" test needs a disposable sheet, not this
one. Flagging as follow-up: build the Sheets repository implementation with a
throwaway test sheet, not this one, and specifically test whether a failed
`batchUpdate` sub-request ever returns success while leaving stale data.

## 5. Runtime

Design spec (KS-57) already settled on `output: 'server'` + the Cloudflare
adapter; `astro.config.mjs` hasn't been switched yet — that's Task #57's job,
not this spike's.

Checked Cloudflare Workers free-tier limits against what this needs:

| Limit | Free tier | Fit |
|---|---|---|
| Requests/day | 100,000 | Vastly more than a single-family admin console needs |
| CPU time/request | 10ms | See below |
| Subrequests/request | 50 | Enough for a 4-5 tab read + a few writes per page |
| Env vars for secrets | 64 × 5KB | A service account JSON key (~2.3KB) fits comfortably |

The 10ms CPU-time figure looks alarming next to an 8-10s (or even 300-800ms)
Sheets round trip, but **CPU time on Workers excludes time spent waiting on
subrequests** — only actual JS execution (parsing the response, rendering the
Astro template) counts against the 10ms. Waiting on the Sheets API, however
slow, doesn't burn CPU budget. Rendering a ledger table for ~28 rooms is cheap
compute; 10ms is unlikely to be the binding constraint. This wasn't load-
tested, just confirmed against Cloudflare's own docs — worth a real check once
KS-57 lands and there's an actual SSR page to profile.

## Caching and the staleness window (KS-55, decided 2026-08-25)

**Decision: cache the client, not the data. Sheet edits appear immediately.**

### What is cached

Only the Sheets **client**, at module scope
(`src/lib/repositories/sheets/client-cache.ts`), so it is reused across
requests within a warm Workers isolate.

This was a real defect, not a micro-optimisation. The client caches its
access token internally, but `getRoomRepository()` constructed a **fresh
client per request**, which made that cache dead code: every console page
render paid an RSA signature plus a token round trip *before* reading the
sheet. Reusing the client cuts a steady-state render from **2 network calls
to 1**, and removes an RSA sign from the Workers CPU budget (10ms/request,
and RSA-2048 signing is a meaningful slice of that).

### What is deliberately *not* cached

Tab contents. The card proposed "read whole tabs, cache them, invalidate on
write" against a premise — *"a table view that fetches per row will burn the
per-minute quota and feel slow"* — that turned out not to hold:

- **Nothing fetches per row.** `listRooms()` and `getRoom()` are each a
  single whole-tab read; the shape the card wanted was already there.
- **It does not feel slow.** Measured after KS-2 went live: pages load
  instantly (see §3).
- **Immediacy is a feature that has been exercised, not a theoretical nicety.**
  "Edit the sheet, reload, see the change with no redeploy" is how the Sheets
  datastore decision was *verified* working. A read cache trades exactly that
  away.

So the honest staleness window is **zero**, and no manual refresh button is
needed — there is nothing to refresh past. That is a better answer than the
card's suggested compromise, and it is only available because the quota
headroom below is genuinely large.

### Quota budget

Steady state, per console page render: **1 read**. Cold isolate: **+1 token
call**, then amortised.

| | Limit | Consumed | Headroom |
|---|---|---|---|
| Reads/min/user | 60 | 1 per page view | ~60 page views/min by one admin |
| Reads/min/project | 300 | same | 5× the per-user ceiling |
| Writes | 300/min | 0 today — client is `spreadsheets.readonly` | full |

Realistic single-admin use is a few page views per minute, so this runs at
roughly 2–5% of the per-user ceiling. A future bill run (KS-21) reading 4–5
whole tabs is a handful of requests, not 28.

**Revisit read caching if any of these become true** — and note that all
three are quota or concurrency conditions, not speed ones:

1. More than one admin browsing heavily at the same time, pushing sustained
   reads toward 60/min.
2. An automated job (scheduled bill generation) running alongside interactive
   use.
3. A screen that genuinely needs several different tabs per render, turning
   one page view into 4–5 reads.

If it is ever needed, the place to add it is behind `SheetsClient` — a TTL
wrapper around `getTabValues` — so nothing above the repository interface
changes. Choose the TTL deliberately at that point: it is the exact number of
seconds by which an admin's edit stops being visible.

## Fallback trigger

Per the original checklist's ask — what would have to go wrong to move off
Sheets, decided now on paper so it's not re-litigated under pressure later:

- **Quota**: sustained need for more than ~60 read or write ops/minute from a
  single admin session (multi-admin concurrent heavy use, or an automated
  job running alongside interactive use) — would need caching (Task #55) at
  minimum, Postgres/Supabase at worst.
- **Write safety**: if the "does a partial write ever look successful"
  follow-up test (above) turns up a real silent-failure mode in the Sheets
  API v4 client itself (not just the interactive connector), and it can't be
  designed around with idempotent writes + read-after-write checks.
- **Latency**: if a real `googleapis`-client measurement lands closer to the
  connector's ~8-10s than the hoped-for 300-800ms, and whole-tab caching
  (Task #55) can't bring interactive pages to an acceptable feel.
- **Multi-tenant**: if this ever becomes a sold template — already covered
  by [0002](decisions/0002-scaling-path-beyond-sheets.md), not a Sheets
  reliability problem.

None of these have fired. The decision in
[0001](decisions/0001-sheets-over-postgres.md) holds.

## Open follow-ups this spike surfaced (not fixed here)

1. Measure real `googleapis` Node client latency against `KS_Mansion_DB` once
   Task #2 wires the client — the connector number above is not that number.
2. Provision the service account and share `KS_Mansion_DB` to it (Task #2).
3. Test partial-write behavior against a disposable test sheet, not
   production data (fold into Task #2 or its own follow-up).
4. Reconcile the Apps Script public-read path with the console's service-
   account path when Task #50 (public vacancy list) is built.
