# Model Catalog — Shipped Ledger (CHANGELOG)

> Concise index of work that has shipped. **`git log` is the authoritative
> history** — this file is just a searchable map of *what* shipped and *where* the
> rationale lived. When a task in [ROADMAP.md](ROADMAP.md) ships, move its one-line
> entry here (under its block) and delete its design subsection from
> [IMPROVEMENTS.md](IMPROVEMENTS.md).

## Block A — Catalog API + regeneration pipeline

> Foundation, migrated 2026-07-21 from **Viglet Turing ES** (its Blocks BC + BD)
> into this dedicated repo. The original Turing task history (T759–T770) is
> preserved in that repo's CHANGELOG; here it is consolidated as Block A.

- **T1** — **Canonical catalog + JSON Schema + public API.** `catalog/models-catalog.json` versioned envelope (`version`/`lastUpdated`/`vendors`) with `kind` on every entry + optional `contextWindow`/`embeddingDimensions`/`capabilities`/`deprecated`; Draft-2020-12 `catalog/models-catalog.schema.json`; zero-dep `scripts/emit.mjs` validates + emits the public artifacts (`catalog.json` + pinned `catalog-v1.json` + schema, each entry flattened with its `vendor`) — 11 vendors, 63 models. CORS-open, versioned static JSON. (orig. Turing BC / T759–T763) → §—
- **T2** — **Multi-source regeneration pipeline.** `pipeline/` zero-dep Node pipeline that regenerates the canonical file from live vendor APIs (OpenAI/Anthropic/Gemini/Cohere/Mistral) + the LiteLLM registry (non-pricing enrichment) + a curated `overrides.json`: `SourceAdapter` contract + offline snapshot cache, merge/reconciliation (precedence pin>live>override>committed>litellm, per-field provenance + conflicts, carry-forward + positive-evidence removal + anchoring), validation + diff review gate (`--apply` only), `npm run regen` orchestrator, and 10 `node:test` units. Additive schema fields `maxOutputTokens`/`modalities`/`knowledgeCutoff`/`releaseDate`/`aliases`/`status` + provenance `sources`/`lastVerified`. (orig. Turing BD / T764–T770) → §—
- **T5** — **Opt-in CI regeneration → PR.** `.github/workflows/regen.yml` — a manual-dispatch (`workflow_dispatch`) workflow that runs the pipeline with API keys from repo secrets, applies the result on a throwaway `catalog-regen/<run>` branch, and opens a PR with the diff report as the body. Never writes to `main`, never auto-merges — a human reviews adds/removes/conflicts and merges. The safe way to let CI refresh the catalog. → §—
- **T3** — **Repo extraction + publishing + project docs.** Stood up this standalone `openviglet/models-catalog` repo: relocated the canonical data + schema + pipeline + emit; a self-contained browsable `public/index.html`; a GitHub Actions **Publish Pages** workflow (emit → deploy, never regenerates upstream); the reference docs (`docs/references/api.md`, `pipeline.md`); the Turing-style roadmap set (ROADMAP/CHANGELOG/IMPROVEMENTS/STRATEGY/last-task) + `roadmap-docs` skill; README + agents.md + CLAUDE.md + Apache-2.0. Turing switched to consuming the published endpoint (remote-only). → §—
