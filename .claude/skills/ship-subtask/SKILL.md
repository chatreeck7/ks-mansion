---
name: ship-subtask
description: Use after review-subtask passes on a KS Mansion Build Task — marks it Done in Notion, leaves an engineering-update note, and flags what it unblocks
---

# Shipping a Build Task

Run this only after `review-subtask` has come back clean (or the user
explicitly overrides). This skill is the one that actually changes Status —
`review-subtask` never does.

1. Confirm the task's PR is merged (or the user confirms it's done without
   one) — don't mark Done against unmerged code.
2. Update the card's `Status` to `Done` via the Notion MCP, in the Build
   Tasks data source (`collection://299d0be8-b7a8-49a8-ade7-00d4b0ea9c30`).
3. Append a short dated note to the card's content, matching the existing
   convention (see the KS-4 card's "Engineering update (2026-08-17): ..."
   note): date, one line on what shipped, PR link if any.
4. Scan the other cards in the Build Tasks data source for `Depends on`
   text referencing this task's title — free-text match, not a relation.
   For each match still `Not started`, note that it's now unblocked.
5. If this was the last non-Done card in its Phase, say so explicitly
   ("this closes Phase 0 — Phase 1 is now open") — that's the trigger
   condition the project's sequencing rule cares about.
6. Don't touch anything outside this one card's Status/content and the
   informational scan in step 4 — no bulk edits, no cascading status
   changes on dependent cards.
