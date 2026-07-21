# Model-catalog regeneration pipeline — maintainer reference

> **What it is.** A **local, zero-dependency Node** pipeline that regenerates this
> repo's canonical `catalog/models-catalog.json` (the single source of truth behind
> the published public catalog API) from **multiple trustworthy sources per
> vendor**, so every model carries provenance-tracked detail instead of a hand
> guess.
>
> It lives in `pipeline/`. Design rationale → [IMPROVEMENTS.md](../IMPROVEMENTS.md) §II.

## The one rule: propose, never auto-overwrite

The public catalog is an authority asset; a bad upstream fetch must not silently
poison it. So the pipeline follows a strict propose-and-review discipline:

- A plain run is **read-only** — it fetches, merges, validates, and writes a
  *proposed* envelope + a diff report into `pipeline/out/`, then prints the
  report. **The canonical file is never touched.**
- Only `--apply` writes `catalog/models-catalog.json` (bumping `lastUpdated`).
- The (planned) CI workflow that runs the fetch would open a **PR**, never
  auto-merge — the review gate stays human.

## Commands

```bash
npm run regen                 # dry-run: fetch → propose → report
npm run regen -- --offline    # replay cached snapshots, no network
npm run regen -- --apply      # write the canonical file
npm run regen -- --only=gemini-api,litellm   # subset of sources
npm run regen -- --date=2026-07-21 --offline # deterministic
npm run emit                  # republish public artifacts from the canonical file
npm test                      # pipeline unit tests
```

| Flag | Effect |
|---|---|
| _(none)_ | Dry-run. Fetch live, write `pipeline/out/proposed-catalog.json` + `diff-report.txt`, print report. Canonical untouched. |
| `--apply` | Write the canonical `catalog/models-catalog.json`. The **only** path that overwrites it. |
| `--offline` | Skip the network; replay `pipeline/sources/<source>.json` snapshots. |
| `--only=a,b` | Restrict to the named source ids (see table below). |
| `--date=YYYY-MM-DD` | Stamp `lastUpdated`/`lastVerified` deterministically (tests). |
| `-v` / `--verbose` | Extra logging. |

## Trusted source per vendor

| Source id | Vendor(s) | Endpoint | Env key | Notes |
|---|---|---|---|---|
| `openai-api` | openai | `GET /v1/models` | `OPENAI_API_KEY` | Ids only → kind is heuristic; enriched by LiteLLM. |
| `anthropic-api` | anthropic | `GET /v1/models` | `ANTHROPIC_API_KEY` | id + display_name + created_at; all CHAT. |
| `gemini-api` | gemini | `models.list` | `GEMINI_API_KEY` | **Richest**: `supportedGenerationMethods` → kind, `inputTokenLimit`/`outputTokenLimit`. |
| `cohere-api` | cohere | `GET /v1/models` | `COHERE_API_KEY` | `endpoints[]` → kind, `context_length`. |
| `mistral-api` | mistral | `GET /v1/models` | `MISTRAL_API_KEY` | `capabilities{}` → tools/vision, `max_context_length`. |
| `ollama-api` | ollama | `GET /api/tags` on `$OLLAMA_HOST` | `OLLAMA_HOST` | Self-hosted; locally-pulled refs, heuristic kind. **`partial`** (see below). |
| `bedrock-api` | bedrock | `ListFoundationModels` | `AWS_ACCESS_KEY_ID` (+`AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) | SigV4-signed (hand-rolled, zero-dep); modalities → kind, `modelName` label, lifecycle → status. **`partial`** (region-scoped). |
| `huggingface-api` | huggingface | Hub `GET /api/models` (sentence-transformers) | `HUGGINGFACE_API_TOKEN` | Local ONNX embedding models; `pipeline_tag` → kind. **`partial`** (bounded query). |
| `litellm` | all | LiteLLM `model_prices_and_context_window.json` | _(none — public)_ | Vendor-agnostic enrichment. **Non-pricing fields only** (STRATEGY §I). |
| `overrides` | any | `pipeline/overrides.json` | _(local)_ | Human-curated pins. |

The self-hosted / aggregator sources (`ollama-api`, `bedrock-api`, `huggingface-api`)
are **opt-in** — each is gated on its own env var and, when it is unset, skipped
exactly like a missing cloud key. They exist so the non-cloud vendor rows stop
depending on LiteLLM alone for anchoring (T4).

**A missing API key skips that source with a warning — the run never hard-fails
because one credential is absent.** Every live fetch is cached as a raw snapshot
under `pipeline/sources/<source>.json` (with fetch timestamp + provenance), so a
merge/normalize change can be re-run offline without re-hitting the network.

## Precedence & the anchoring rule

Merge folds all drafts per `(vendor, id)`. **Per-field**, the highest-precedence
source that supplies a value wins; provenance is recorded per field and
disagreements are flagged as conflicts in the report.

```
pinned override (100) > live vendor API (50) > override (30) > self-hosted/aggregator (20) > committed catalog (15) > LiteLLM (10)
```

- **Scalar fields** (`kind`, `contextWindow`, `maxOutputTokens`, `label`, …) →
  highest-precedence wins; conflicts reported.
- **Set fields** (`capabilities`, `aliases`) → union of all sources.
- **`modalities`** → union of `input`/`output` arrays.

Two safety rules keep a noisy/partial run from poisoning the reference:

- **Carry-forward (additive by default).** The committed catalog is itself a
  low-priority source, so every existing entry is preserved + enriched. A run with
  only some API keys never silently drops the vendors it didn't fetch.
- **Positive-evidence removal.** An id is dropped only when its vendor's own live
  API ran and did not list it (and it isn't override-pinned). LiteLLM, a missing
  key, or a **`partial`** source can never cause a removal.
- **Anchoring rule.** A *new* id is admitted only if a live vendor API, a
  self-hosted/aggregator source, or an override vouches for it. LiteLLM enriches
  existing/vendor-confirmed ids but can never introduce a brand-new id. Skipped
  LiteLLM-only ids are listed in the report.
- **`partial` sources.** A self-hosted/aggregator source (`ollama-api`,
  `bedrock-api`, `huggingface-api`) sees only an environment-scoped/bounded slice
  (one host's pulls, one region, a capped query), so it *anchors* the ids it returns
  but is **never** removal evidence — it can't drop an id it simply didn't see.

`overrides.json` is a claim you stand behind: set `"__pin": true` on an entry to
force its fields above **everything**; otherwise a pin sits above LiteLLM and
below the live vendor API.

### `overrides.json` shape

```jsonc
{
  "openai": [
    { "id": "text-embedding-3-large", "embeddingDimensions": 3072, "__pin": true }
  ]
}
```

## Provenance written into the catalog

Each regenerated entry gains two additive fields: `sources` (the source ids that
contributed) and `lastVerified` (the run date). Richer optional fields the sources
populate: `maxOutputTokens`, `modalities`, `knowledgeCutoff`, `releaseDate`,
`aliases`, `status`. Consumers ignore unknown keys, so the envelope stays
`version: 1`. Full contract in [api.md](./api.md).

## Review workflow

1. `npm run regen` (set whatever API keys you have).
2. Read `pipeline/out/diff-report.txt` — check ADD/REMOVE/CHANGE and any `⚠ conflict`.
3. Wrong upstream value? Pin the correct one in `pipeline/overrides.json` and re-run.
4. Satisfied → `npm run regen -- --apply`, then `npm run emit` to republish.
5. Commit `catalog/models-catalog.json` (+ any `overrides.json` change). `pipeline/sources/`
   and `pipeline/out/` are gitignored.

## Non-goals

No pricing (STRATEGY §I — enrichment is non-pricing only). No runtime dependency —
this is a local maintenance tool; consumers read the published/bundled catalog. No
auto-overwrite / no CI auto-merge — the review gate is mandatory. No envelope-shape
break (`version` stays 1, additive only).
