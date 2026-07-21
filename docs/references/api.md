# Public Model Catalog API — contract reference

> The catalog is published as an open, CORS-enabled, versioned JSON artifact via
> GitHub Pages from this repo (`.github/workflows/publish.yml`). Base URL:
> `https://openviglet.github.io/models-catalog` (a branded custom domain such as
> `models.viglet.org` can front it later — set `CATALOG_SOURCE_URL` at emit time).

## What it is

A **vendor-neutral, kind-aware catalog of LLM/embedding/rerank/media models** —
which model ids exist per vendor and, for each, what *kind* it is (chat,
embedding, rerank, image, transcription, speech, video, moderation), plus context
window, max output tokens, embedding dimensions, modalities and capability hints.
Published as an open, CORS-enabled, versioned JSON artifact so any tool can consume
it as a market reference (the role LiteLLM's `model_prices_and_context_window.json`
plays for pricing, but identity/kind-first and browsable).

It is **free, unauthenticated, and read-only.** First cut is *identity + kind +
capability* — **not pricing** (see [STRATEGY.md](../STRATEGY.md) §I).

## Endpoints

| URL | Meaning |
|---|---|
| `…/catalog.json` | Rolling latest — the current schema version. |
| `…/catalog-v1.json` | Pinned to schema **v1** — safe for external consumers to lock. |
| `…/index.json` | **Compact index** — the same envelope, each entry trimmed to `{ vendor, id, label, kind }`. A fraction of the payload for model-pickers that only render a grouped list; lazy-load the full record from `catalog.json` on selection. |
| `…/catalog.schema.json` | The JSON Schema (Draft 2020-12) describing the envelope + entry. |
| `…/` (repo Pages root) | Human-browsable reference page (`public/index.html`). |

**Serving.** Hosted on **GitHub Pages**, which serves every asset with
`Access-Control-Allow-Origin: *`, so the endpoint is **CORS-open by default** — no
header config needed. Cache is host-managed. Breaking schema changes bump the
pinned path (`catalog-v2.json`); `catalog.json` always tracks the newest. The files
are regenerated deterministically from the canonical source
(`catalog/models-catalog.json`) on every publish, so they never drift.

## Envelope

```jsonc
{
  "$schema": "https://openviglet.github.io/models-catalog/catalog.schema.json",
  "version": 1,                 // schema major version (integer)
  "lastUpdated": "2026-07-21",  // ISO-8601 date the catalog was regenerated
  "source": "https://openviglet.github.io/models-catalog",
  "vendors": {
    "openai":    [ /* ModelEntry, ... */ ],
    "anthropic": [ /* ModelEntry, ... */ ],
    "gemini":    [ /* ... */ ]
    // keyed by provider plugin type (lower-case)
  }
}
```

## `ModelEntry`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✅ | The exact id sent to the vendor (`text-embedding-3-large`). |
| `label` | string | ✅ | Human-friendly display name. |
| `kind` | enum | ✅ | `CHAT` · `EMBEDDING` · `RERANK` · `IMAGE` · `TRANSCRIPTION` · `SPEECH` · `VIDEO` · `MODERATION` · `UNKNOWN`. |
| `vendor` | string | ✅ | Provider plugin type (echoes the map key; added in the published artifact). |
| `contextWindow` | integer | — | Max context tokens, when known. |
| `embeddingDimensions` | integer | — | Output vector size — only for `kind = EMBEDDING`. |
| `capabilities` | string[] | — | Hints such as `vision`, `tools`, `reasoning`. |
| `deprecated` | boolean | — | `true` when the vendor has retired/superseded the id. |
| `maxOutputTokens` | integer | — | Max tokens emittable in one response, when known. |
| `modalities` | object | — | `{ input: string[], output: string[] }` — supported I/O modalities. |
| `knowledgeCutoff` | string | — | Training knowledge cutoff (ISO date or `YYYY-MM`). |
| `releaseDate` | string | — | ISO-8601 date the id became available. |
| `aliases` | string[] | — | Alternate ids that resolve to this model (dated snapshots, `-latest`). |
| `status` | enum | — | `PREVIEW` · `GA` · `DEPRECATED` · `RETIRED` — lifecycle stage; prefer over `deprecated`. |
| `sources` | string[] | — | Provenance — source ids that contributed fields (`openai-api`, `litellm`, `overrides`). |
| `lastVerified` | string | — | ISO-8601 date the entry was last confirmed against its sources. |

> **Envelope stays `version: 1`.** All fields below `deprecated` are **optional and
> additive** — existing consumers ignore unknown keys. They are populated by the
> regeneration pipeline ([pipeline.md](./pipeline.md)); hand entries may omit them.

## Usage examples

```bash
# every embedding model across all vendors
curl -s https://openviglet.github.io/models-catalog/catalog-v1.json \
  | jq '.vendors | to_entries[].value[] | select(.kind=="EMBEDDING") | .id'
```

```js
// browser / Node — kind lookup for an arbitrary id
const { vendors } = await (await fetch(
  "https://openviglet.github.io/models-catalog/catalog-v1.json",
)).json()
const all = Object.values(vendors).flat()
const kindOf = (id) => all.find((m) => m.id === id)?.kind ?? "UNKNOWN"
```

## How consumers use it

Any tool can fetch the endpoint directly. **Viglet Turing ES** fetches
`turing.models-catalog.url` (default the rolling endpoint) with an ETag/TTL cache
as its model-picker catalog. The live per-vendor `/v1/models` listing path and
Turing's metadata-first kind classification are unchanged — the public catalog only
provides the static reference.

## Relationship to other artifacts

- **Source of truth:** `catalog/models-catalog.json` in this repo; this doc is its
  published contract.
- **Regeneration:** [pipeline.md](./pipeline.md) — the multi-source, propose-and-review pipeline.
- **Positioning:** [STRATEGY.md](../STRATEGY.md) §I (why this is a discoverability asset).
