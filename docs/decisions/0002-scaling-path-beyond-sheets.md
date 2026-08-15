# 0002: Scaling path if the console becomes a sellable template

**Status**: Noted for later — not a current decision, no work triggered by this yet

**Context**: [0001](0001-sheets-over-postgres.md) chose Google Sheets as the
datastore for the single-property family use case, specifically because it's
free and lets admins edit data directly. If this console is ever turned into
a template sold to other properties, that changes: each customer needs
isolated data, and a shared spreadsheet-per-admin model doesn't hold up
multi-tenant.

**Option, if that day comes**: swap the Sheets repository implementation for
a free-tier hosted database with real multi-tenant isolation — most likely
**Supabase** (Postgres + auth + row-level security, free tier), or
**Turso**/**Cloudflare D1** (SQLite at the edge, free tier) as lighter
alternatives. Hosting (Astro SSR) stays free on Cloudflare Pages or Vercel
either way.

**Why this is cheap to defer**: because [0001](0001-sheets-over-postgres.md)'s
repository-interface boundary means feature code never talks to the Sheets
API directly. Making this swap later means writing a new implementation
under `src/lib/repositories/`, not rewriting the console — see
`.claude/skills/sheets-backed-feature/SKILL.md`.

**Known limit**: free tiers on these options aren't free forever — e.g.
Supabase's free project pauses after inactivity and caps DB size/connections.
Fine for early customers; would need re-costing once there's real
multi-tenant load.

**Not doing now**: no migration, no multi-tenant schema, no new tasks on the
Build Tasks board. This file exists so the option isn't re-litigated from
scratch if it comes up later.
