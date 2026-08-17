---
name: breakdown-subtask
description: Use when a KS Mansion Build Task card has grown past its Size or is too vague to start — splits it into smaller Notion cards instead of letting it sit half-done
---

# Splitting an oversized Build Task

Project rule (from the Family Project page): "If a card feels bigger than L
once you're in it, split it rather than letting it sit half-done." Sizes are
S = one session, M = a few, L = a week or more — anything that no longer
fits is a split candidate.

1. Identify the card to split (by Task ID/title) in the Build Tasks data
   source (`collection://299d0be8-b7a8-49a8-ade7-00d4b0ea9c30`) and read its
   full content, `Spec ref`, `Phase`, `Feature`, and `Area`.
2. Draft the split: 2-5 new cards, each independently sized S or M, each
   inheriting the parent's `Phase`/`Feature`, with `Area` set per-piece if
   the pieces cross areas (e.g. data model vs. UI). Chain `Depends on`
   across the pieces in the order they should be built, and set `Spec ref`
   per piece if the parent's AC list decomposes cleanly (it often does —
   see the intake doc's per-AC lists under each feature).
3. Present the proposed split in chat — titles, sizes, dependency chain —
   before writing anything to Notion. This is a judgment call each time;
   get confirmation, don't auto-apply.
4. On approval, create the new cards in the Build Tasks data source via the
   Notion MCP.
5. Resolve the original card: if every piece of it is now covered by a new
   card, archive the original. If only part of it was split off, rename the
   original to reflect the remaining scope and leave its Status alone. Ask
   the user which applies if it isn't obvious from the split.
6. Never split across Phase boundaries in a way that makes a Phase 0 card
   depend on Phase 1 work, or vice versa — that would invert the sequencing
   the whole board is built around.
