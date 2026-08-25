# Hosting: SSR on Cloudflare Pages (KS-57)

**Status**: Code migration done and locally verified. **Not yet deployed** —
the Cloudflare account steps below need doing by someone with the account.
**Date**: 2026-08-24

Supersedes GitHub Pages. Built on
[0001](decisions/0001-sheets-over-postgres.md) and the
[KS-52 spike findings](data-layer.md).

## Why move

`/console` needs a server for two independent reasons:

1. **Sheets credentials** (KS-2) — a service-account key cannot ship to the
   browser, so the read has to happen server-side.
2. **Admin auth** (KS-4) — this is the sharper one. On a purely static host
   there is no request-time gate to check a session against. Any access
   control bolted onto static HTML is either client-side JS (defeatable — the
   real content is already in the shipped HTML) or needs exactly the server
   runtime this card adds. **KS-4 cannot be a real security boundary until
   this lands**, and that dependency is not recorded on KS-4's card.

Marketing pages don't need any of that, so they stay static.

## What changed in the repo

| Change | File |
|---|---|
| `output: 'server'` + Cloudflare adapter | `astro.config.mjs` |
| Dropped `base: '/ks-mansion'` (Cloudflare serves from root) | `astro.config.mjs` |
| `export const prerender = true` on all 7 marketing pages | `src/pages/*.astro` |
| `/console` meta-refresh → real `Astro.redirect(..., 302)` | `src/pages/console/index.astro` |
| Room detail `getStaticPaths` → per-request SSR + 404 | `src/pages/console/rooms/[room].astro` |
| Cloudflare build config | `wrangler.jsonc` (new) |
| GitHub Pages deploy → Cloudflare Pages deploy | `.github/workflows/` |

Adapter pinned to `@astrojs/cloudflare@^12.6.13` — **not** the current `14.x`,
which requires Astro 7. `12.x` is the line whose peer range is `astro: ^5.7.0`.
Upgrading the adapter past `12.x` requires upgrading Astro first.

### Room detail is now per-request, deliberately

It was statically generated via `getStaticPaths`. Under `output: 'server'`
that would pin the room list at build time — wrong once room data lives in
Sheets, where an admin's edit must appear without a redeploy. It now resolves
`Astro.params.room` per request and returns a real 404 for an unknown id
(previously an unknown id simply had no route).

### Base path removal

`base: '/ks-mansion'` existed only because GitHub Pages serves from a repo
subpath. Cloudflare serves from the root, so it's gone.

Nothing in the console had to change: `src/lib/console/paths.ts` already
routes every internal link through `import.meta.env.BASE_URL`, and the
marketing pages already use it too. Removing the base also fixed a
pre-existing favicon 404 — both layouts hardcode `href="/favicon.svg"`, which
404'd under the base and now resolves.

> ⚠️ **The in-flight i18n work is not base-safe.** `src/i18n/utils.ts`
> (currently uncommitted, so not on this branch) hardcodes `/ks-mansion` in
> **three** places — `getLocaleFromUrl` line 17, `getPathWithoutLocale` line
> 36, `getLocaleUrl` line 88. KS-57's card predicted two; the third arrived
> with the newer i18n work. Once the base is gone these silently do nothing
> (`.replace()` on an absent prefix) or emit dead `/ks-mansion` URLs, breaking
> the language switcher. **Whoever lands the i18n branch must switch those to
> `import.meta.env.BASE_URL`** — follow `src/lib/console/paths.ts`, which is
> already base-injectable and unit-tested.

## Still to do — needs the Cloudflare account

None of this can be done from the repo:

1. **Create the Pages project** named `ks-mansion` (matching
   `wrangler.jsonc`), connected to this GitHub repo or deployed via the
   workflow.
2. **Add two GitHub repo secrets** so `.github/workflows/deploy.yml` can
   deploy — it fails fast with an explicit error until both exist:
   - `CLOUDFLARE_API_TOKEN` — needs the *Cloudflare Pages: Edit* permission
   - `CLOUDFLARE_ACCOUNT_ID`
3. **Decommission GitHub Pages** in repo settings once Cloudflare serves the
   site, so two hosts don't serve divergent copies.
4. **KS-4 will need a `SESSION` KV namespace.** The adapter auto-enables
   sessions backed by a KV binding named `SESSION`. No binding is declared in
   `wrangler.jsonc` — a placeholder id would only break `wrangler` commands.
   Nothing uses sessions today, so nothing is broken; KS-4 creates the
   namespace and adds the binding.

## Secret storage

Cloudflare **Secrets** (encrypted env vars), set per Pages project — via the
dashboard or `wrangler pages secret put`. Not committed, not in
`wrangler.jsonc`, never exposed to the client.

The KS-52 spike confirmed the size fits: 64 env vars × 5KB each, against a
service-account JSON key of ~2.3KB.

`nodejs_compat` is already set in `wrangler.jsonc` — `googleapis` needs Node
built-ins that Workers only exposes behind that flag, so KS-2 isn't blocked
on a config change.

### Secrets the console needs

Set as **Secret** (encrypted), not plaintext, under **Workers & Pages →
ks-mansion → Settings → Environment variables**:

| Name | What | Needed by |
|---|---|---|
| `CONSOLE_PASSWORD_HASH` | SHA-256 **hex digest** of the admin password — not the password | KS-4 auth |
| `SESSION_SECRET` | Random string, **32+ chars**, signs the session cookie | KS-4 auth |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service-account key file contents | KS-2 |
| `SHEETS_SPREADSHEET_ID` | `1Nn8UgvHbhpxuN54Crou-uldGKcYQWVQcwCigVscSaDo` | KS-2 |

Generate the two auth values locally — neither the password nor the secret
should ever be pasted into a chat or committed:

```bash
node -e "process.stdout.write('paste-your-password-here')" | shasum -a 256
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**The console fails closed.** If either auth secret is missing, malformed, or
the session secret is under 32 characters, every `/console` route returns
**503** — it does not fall open. A plaintext password pasted into
`CONSOLE_PASSWORD_HASH` is rejected at the gate for the same reason, rather
than silently never matching.

For local development, put the same two values in a `.dev.vars` file at the
repo root (gitignored) and `astro dev` picks them up via `platformProxy`.

## Free tier fit

Confirmed against Cloudflare's published Workers limits (see
[data-layer.md](data-layer.md#5-runtime) for the KS-52 analysis):

| Limit | Free tier | Fit |
|---|---|---|
| Requests/day | 100,000 | Far beyond a single-family admin console |
| CPU time/request | 10ms | Excludes I/O wait, so Sheets latency doesn't count — only render compute |
| Subrequests/request | 50 | Enough for a 4–5 tab read plus writes |
| Secrets | 64 × 5KB | Service-account key ~2.3KB |

`_routes.json` (generated at build) excludes static assets and the seven
marketing pages from the worker, so ordinary marketing traffic doesn't
consume worker invocations at all.

## PDF generation — fits, but tightly. Verify before committing to it.

KS-57 asked whether PDF generation (F1 bills, F4 export) fits this runtime.
Workers cannot run Puppeteer/headless Chrome directly. Cloudflare's
**Browser Rendering** is the supported route, and it *is* on the free plan —
but the caps are tight
([limits](https://developers.cloudflare.com/browser-rendering/platform/limits/)):

| Free-plan limit | Value |
|---|---|
| Browser time | 10 min/day |
| Concurrent browsers | 3 per account |
| New instances | 1 per 20 seconds |
| Browser timeout | 60 s |

A ~28-bill run is feasible **only if batched correctly**: one browser
instance rendering all 28 documents sequentially (~28 × 2s ≈ 56s) fits the
10-min daily budget easily. Spinning up a browser per bill does not — the
"1 new instance / 20s" cap alone makes that ~9 minutes of waiting.

**The binding constraint is the 60-second browser timeout**, which the
sequential estimate above nearly exhausts with no margin. If per-document
render is slower than ~2s, a single-instance batch will time out mid-run.

**Not tested, and the estimate is the untested part.** These are published
limits, not measurements — no PDF has been rendered. Two things to settle
before Phase 1 depends on this:

- Measure real per-document render time with the **Thai font embedded** — the
  card correctly flags this as the heaviest ask. Thai needs combining vowels
  and tone marks positioned above/below the base glyph; getting that right
  is what makes the font non-trivial, and font loading is often the slowest
  part of a cold render.
- Have a fallback picked. Options: split a run into several browser
  instances (respecting the 20s spacing), generate PDFs client-side, or use
  a pure-JS writer like `pdf-lib` with no browser at all — though Thai text
  shaping is exactly where a non-browser writer is weakest.

## Pages vs Workers

Checked whether Pages is a sunsetting platform before building on it: as of
this writing Cloudflare's own migration guide does **not** deprecate Pages or
recommend Workers for new projects — it frames Workers as having "a
distinctly broader set of features," notably Durable Objects and **Cron
Triggers**, rather than as a replacement.

Worth revisiting if KS-21 (billing) wants *scheduled* bill generation — Cron
Triggers are a Workers feature Pages doesn't offer. Not a reason to change
now.

## Verified locally

`astro build` succeeds; `astro check` clean; 102/102 tests pass. Against
`astro dev` on the built config:

| Route | Result |
|---|---|
| `/console` | 302 → `/console/rooms` (real redirect, not meta-refresh) |
| `/console/rooms` | 200, SSR |
| `/console/rooms/206` | 200, SSR |
| `/console/rooms/999` | 404 (new guard) |
| `/` + 6 marketing routes | 200, prerendered |
| `/favicon.svg` | 200 (was 404 under the base path) |
| `/ks-mansion/` | 404 (base correctly gone) |

Build output is the right shape: `_worker.js` plus `_routes.json`, seven
prerendered marketing pages, and **no** prerendered console HTML.

**Not verified**: anything requiring the real Cloudflare runtime — actual
deploy, real secrets, KV, and the PDF path above. `astro dev` with
`platformProxy` emulates bindings; it is not Workers.
