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
- **`public/`** — `index.html` browsable page (committed); `models/*` emitted (gitignored).
- **`docs/`** — roadmap set + `references/`.
- **`.github/workflows/publish.yml`** — emit → deploy to GitHub Pages (never regenerates upstream).

## Conventions

- **Zero dependencies.** Node built-ins + global `fetch` only; inline HTML/CSS/JS in the page. Nothing to `npm install`. Node ≥ 20. Keep it this way.
- **Propose, never auto-overwrite.** The canonical file is written only on `npm run regen -- --apply`. A plain run is read-only (writes a proposed envelope + diff report to `pipeline/out/`). CI may open a PR but never merges — a bad upstream fetch must never silently publish.
- **Non-pricing.** Identity + kind + capability only, never cost/price (STRATEGY §I). The LiteLLM adapter strips every `*cost*`/`*price*` key. Do not add pricing fields.
- **Additive schema, `version: 1`.** New `ModelEntry` fields are optional; consumers ignore unknowns. A breaking shape change bumps `version` and the pinned `catalog-vN.json` path.
- **Provenance is first-class.** Regenerated entries carry `sources` + `lastVerified`. Prefer omitting a field over guessing it — wrong metadata poisons the reference.
- **Merge safety rules** (see `pipeline/lib/merge.mjs`): carry-forward (committed catalog is a low-priority source, so a partial-key run never drops un-fetched vendors), positive-evidence removal (drop an id only when its vendor's live API ran and omitted it), and the anchoring rule (LiteLLM enriches but never introduces a brand-new id).

## Commands

```bash
npm run regen               # dry-run: fetch -> merge -> validate -> report
npm run regen -- --apply    # write the canonical file
npm run regen -- --offline  # replay cached snapshots (no network)
npm run emit                # rebuild public artifacts from the canonical file
npm test                    # pipeline unit tests (node:test)
```

## Relationship to Viglet Turing ES

Turing consumes the published endpoint as its model-picker reference (remote fetch,
`turing.model-catalog.url`), but does not own the catalog. This repo versions,
publishes and evolves independently. User-facing text says **Viglet Turing ES**;
the public repo is `openviglet/model-catalog`.
