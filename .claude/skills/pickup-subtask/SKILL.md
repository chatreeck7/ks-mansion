---
name: pickup-subtask
description: Use when starting new work on the KS Mansion admin console — finds the next Build Task to work on from Notion, respecting phase gating and dependencies, and moves it to In progress
---

# Picking up a Build Task

The Notion "KS Mansion — Build Tasks" data source is the single source of
truth for what to work on next
(`collection://299d0be8-b7a8-49a8-ade7-00d4b0ea9c30`, under the
[Build Tasks database](https://app.notion.com/p/81e6d54013084cdfbb69e7c2ae1195d6),
child of [the Family Project page](https://app.notion.com/p/3bac9988b4d981e88766ef8d0407638f)).

1. Query the data source for `Status = "Not started"`.
2. Find the earliest Phase (`Phase 0 — Foundation` → `Phase 1 — Core Ops` →
   `Phase 2 — Property Ops` → `Phase 3 — Insight & Site`) that still has any
   card not `Done`. Only consider cards in that phase — never a later one,
   even if it looks unblocked. This is a hard rule from the project page
   ("Don't start a Phase 1 card until every Phase 0 card is Done"), not a
   suggestion.
3. Within that phase, drop any card whose `Depends on` text names another
   task that isn't `Done` yet. `Depends on` is free text, not a relation —
   match by task title substring.
4. Sort what's left by `Priority` (P0 > P1 > P2), then `Task ID` ascending.
   Take the top card.
5. Fetch that card's full page content (not just properties) — task pages
   often carry warning notes (e.g. the KS-4 auth card's "fully
   unauthenticated right now" note) that change how you should approach the
   work.
6. Present the card to the user: title, Task ID, Phase, Spec ref, Size, and
   any page content. Confirm before touching anything.
7. On confirmation, update the card's `Status` to `In progress` via the
   Notion MCP.
8. Offer to create a branch or worktree named `ks-<id>-<slug>` (e.g.
   `ks-4-admin-auth`). If the user wants isolation from the current
   workspace, use the `superpowers:using-git-worktrees` skill for the
   mechanics rather than improvising.
9. If `Spec ref` is set, pull the matching AC/NFR section from the intake
   doc before writing any code — see `review-subtask` for where that doc
   lives and how to find the right section.
