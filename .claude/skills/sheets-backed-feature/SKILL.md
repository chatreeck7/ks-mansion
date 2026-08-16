---
name: sheets-backed-feature
description: Use when adding or modifying any /console feature that reads or writes data — enforces the repository-interface boundary so Sheets stays swappable
---

# Adding a Sheets-backed feature

1. Define the domain type first (e.g. `Tenant`, `Bill`) in `src/lib/models/` —
   no Sheets concepts (row index, sheet name) in this layer.
2. Add/extend the repository interface in `src/lib/repositories/` — methods
   are domain verbs (`getTenant`, `listActiveLeases`), never `getRow` /
   `getRange`.
3. Implement against Sheets in `src/lib/repositories/sheets/` — this is the
   only layer allowed to import the Sheets client.
4. Feature code (routes, components) imports the interface, never the Sheets
   implementation directly.
5. If a task depends on a Phase 0 item that isn't done yet (see the Notion
   Build Tasks board), stop and flag it — don't build around a missing
   dependency.
