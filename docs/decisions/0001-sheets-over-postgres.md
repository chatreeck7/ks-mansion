# 0001: Google Sheets over Postgres for the admin console

**Status**: Decided and verified (KS-52 spike, 2026-08-17 — see
[data-layer.md](../data-layer.md) for quota/latency/write-safety evidence and
the fallback trigger). Originally recorded as intent; see Notion — KS Mansion
Admin Console — Family Project for task history.

**Decision**: The `/console` admin app uses Google Sheets as its datastore,
accessed server-side through a repository interface, instead of Postgres.

**Why**: Zero hosting cost at this scale (~28 units), and admins can open and
edit the data directly in Sheets without the console being finished.

**Consequence**: All feature code must go through `src/lib/repositories/` —
see `.claude/skills/sheets-backed-feature/SKILL.md`. Sheet tabs themselves
follow the conventions in [sheet-schema.md](../sheet-schema.md) (stable IDs,
header-as-contract, append-only history). This keeps a future swap
to Postgres (e.g. if a template/resale version needs multi-tenant isolation)
a scoped refactor instead of a rewrite. This decision applies only to the
admin console track — the public marketing site's original Postgres/Stripe/
Sanity notes in CLAUDE.md remain relevant if that site grows its own backend.
