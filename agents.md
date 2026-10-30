# Model Catalog — project guidelines

A dedicated repo for the public **model catalog API** and its **regeneration
pipeline**, extracted from Viglet Turing ES. It publishes a vendor-neutral,
kind-aware JSON catalog of LLM/embedding/rerank/media models and provides a
zero-dep, propose-and-review pipeline to keep it current.

## Roadmap & docs maintenance

> Reach for the [`roadmap-docs`](.claude/skills/roadmap-docs/SKILL.md) skill (or
> `/roadmap-docs`) before adding/shipping a task or editing any roadmap doc.

The roadmap is split across four `docs/` files, kept in sync:

| File | Responsibility |
|---|---|
| `docs/ROADMAP.md` | Task **status** — unshipped work only (📋/💭/⏳/🛠), one line per task |
| `docs/CHANGELOG.md` | What **shipped** — one line per task, under its block |
| `docs/IMPROVEMENTS.md` | **Design rationale** for unshipped sections only |
| `docs/STRATEGY.md` | Business/positioning (markets, deprecations, bets) |

The next free `T<n>` lives in `docs/last-task.md` — read it before adding a task,
use `T<n+1>`, then bump the counter + append a one-line log entry. **One task →
one commit** (code + doc sync together). Reference docs live in
`docs/references/` (`api.md` = the public contract, `pipeline.md` = the maintainer
workflow).

## Structure

- **`catalog/`** — `model-catalog.json` (single source of truth) + `model-catalog.schema.json` (Draft 2020-12).
- **`pipeline/`** — the regeneration pipeline: `regen.mjs` orchestrator, `adapters/` (per-source), `lib/` (util/merge/validate), `overrides.json` (curated pins), `regen.test.mjs`. `sources/` (raw snapshot cache) and `out/` (proposed envelope + report) are gitignored.
- **`scripts/emit.mjs`** — builds the public artifacts (`public/models/*`) from the canonical file.
- **`src/page/`** — the browsable page's **TypeScript** source (T65): `types`/`state`/`dom`/`constants`/`format`/`table`/`detail`/`panels`/`controls`/`main`. Compiled by `tsc` (`tsconfig.json`) to `public/app/*.js`. `src/sdk/model-catalog-client.d.ts` types the self-hosted SDK import.
- **`public/`** — `index.html` (committed) links `styles.css` (committed source) and loads `app/main.js`; `app/*` (compiled page), `models/*` and the JSON artifacts are emitted (gitignored).
- **`docs/`** — roadmap set + `references/`.
- **`.github/workflows/publish.yml`** — `npm ci` → `build:page` (tsc) → emit → deploy to GitHub Pages (never regenerates upstream).

## Conventions

- **Zero *runtime* dependencies; one *build* dependency, page-only.** The pipeline (`pipeline/**`), `emit.mjs` and the SDKs (`clients/**`) use Node built-ins + global `fetch` only — nothing to `npm install`, keep it that way. **Exception (T65, a deliberate documented reversal of the page's zero-*build* stance):** the browsable page is authored in TypeScript under `src/page/` and compiled by `tsc` (dev dependency `typescript`, hence a `package-lock.json`) to `public/app/*.js`. The page therefore has a build step, but still ships **no runtime dependency** — plain ES-modules, self-contained, CORS-open static files. Node ≥ 20. Do not add dependencies beyond this.
- **Propose, never auto-overwrite.** The canonical file is written only on `npm run regen -- --apply`. A plain run is read-only (writes a proposed envelope + diff report to `pipeline/out/`). CI may open a PR but never merges — a bad upstream fetch must never silently publish.
- **Pricing = indicative US list only.** Per STRATEGY §I (reversed 2026-07-22, tracked as Block F), the catalog carries an *optional* per-token US **list** price — flagged **indicative, not authoritative** (a reference, verify with the vendor), sourced + `lastVerified`, never invented. Never per-contract/region/negotiated pricing; it is not a billing engine. Shipped by Block F: the `pricing` field (T30) and the LiteLLM adapter mapping its per-token USD costs into it (T31, per-1M, provenance-stamped); it enriches a blank price then holds stable (committed beats LiteLLM), and an `overrides.json` pin corrects a value.
- **Additive schema, `version: 1`.** New `ModelEntry` fields are optional; consumers ignore unknowns. A breaking shape change bumps `version` and the pinned `catalog-vN.json` path.
- **Provenance is first-class.** Regenerated entries carry `sources` + `lastVerified`. Prefer omitting a field over guessing it — wrong metadata poisons the reference.
- **Merge safety rules** (see `pipeline/lib/merge.mjs`): carry-forward (committed catalog is a low-priority source, so a partial-key run never drops un-fetched vendors), positive-evidence removal (drop an id only when its vendor's live API ran and omitted it), and the anchoring rule (LiteLLM enriches but never introduces a brand-new id).

## Commands

```bash
npm run regen               # dry-run: fetch -> merge -> validate -> report
npm run regen -- --apply    # write the canonical file
npm run regen -- --offline  # replay cached snapshots (no network)
npm run build:page          # compile the page TypeScript (src/page/) -> public/app/
npm run typecheck           # type-check the page without emitting
npm run emit                # rebuild public JSON artifacts from the canonical file
npm run build               # build:page + emit (what CI runs before deploy)
npm run banner              # re-render public/og-banner*.png from scripts/og-banner.html (needs Chrome/Edge; run after emit)
update-data.cmd             # Windows: all of the above in order (regen review+apply, test, build, banner) + flag stale plans.json/providers.json
npm test                    # pipeline unit tests (node:test)
```

> The page needs a one-time `npm install` (dev-only `typescript`); the pipeline/emit/SDKs do not.

## Relationship to Viglet Turing ES

Turing consumes the published endpoint as its model-picker reference (remote fetch,
`turing.model-catalog.url`), but does not own the catalog. This repo versions,
publishes and evolves independently. User-facing text says **Viglet Turing ES**;
the public repo is `openviglet/model-catalog`.
