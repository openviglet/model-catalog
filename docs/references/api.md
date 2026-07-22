# Public Model Catalog API — contract reference

> The catalog is published as an open, CORS-enabled, versioned JSON artifact via
> GitHub Pages from this repo (`.github/workflows/publish.yml`). Base URL:
> `https://openviglet.github.io/model-catalog` — the endpoint intentionally stays on
> its public GitHub Pages host, so it reads as a community-owned resource rather than a
> brand asset. (The emitted URLs are still overridable via `CATALOG_SOURCE_URL` at emit
> time if a deployment ever needs a different host.)

## What it is

A **vendor-neutral, kind-aware catalog of LLM/embedding/rerank/media models** —
which model ids exist per vendor and, for each, what *kind* it is (chat,
embedding, rerank, image, transcription, speech, video, moderation), plus context
window, max output tokens, embedding dimensions, modalities and capability hints.
Published as an open, CORS-enabled, versioned JSON artifact so any tool can consume
it as a market reference (the role LiteLLM's `model_prices_and_context_window.json`
plays for pricing, but identity/kind-first and browsable).

It is **free, unauthenticated, and read-only.** The core is *identity + kind +
capability*; it also carries an **optional, indicative US list price** per model
(`pricing`) — a reference only, **not authoritative**, verify with the vendor (see
[STRATEGY.md](../STRATEGY.md) §I and the [`pricing`](#pricing--indicative-us-list-price-️) field below).

## Endpoints

| URL | Meaning |
|---|---|
| `…/catalog.json` | Rolling latest — the current schema version. |
| `…/catalog-v1.json` | Pinned to schema **v1** — safe for external consumers to lock. |
| `…/index.json` | **Compact index** — the same envelope, each entry trimmed to `{ vendor, id, label, kind }`. A fraction of the payload for model-pickers that only render a grouped list; lazy-load the full record from `catalog.json` on selection. |
| `…/stats.json` | **Aggregate metrics** — pre-computed counts (models per vendor / kind / capability / input+output modality), per-field fill **coverage**, and grand `totals`. Read one number instead of re-aggregating the full catalog. Its own envelope (not a `vendors` map). |
| `…/coverage.json` | **Per-vendor coverage** — the same per-field fill definition as `stats.json`, broken down **per vendor** (`{ filled, rate }` per field) plus an `overall`. Makes gaps explicit — "context window known for 82% of vendor X". Its own envelope (not a `vendors` map). |
| `…/changes.json` | **Change feed** — what changed vs. the previously published catalog: `added` / `removed` / lifecycle-`changed` ids for this publish, with `counts`. Its own envelope (not a `vendors` map). |
| `…/feed.xml` | **Atom feed** — the same adds / removals / lifecycle transitions as `changes.json`, subscribable in any feed reader. |
| `…/catalog.csv` | **Flat CSV export** — one row per model, RFC-4180 quoted (array fields `;`-joined). For spreadsheets / BI. |
| `…/catalog.ndjson` | **NDJSON export** — one flattened model per line. For streaming, `jq -c` and `grep`. |
| `…/by-kind/<KIND>.json` | **Faceted slice** — the full catalog filtered to one `kind` (e.g. `by-kind/EMBEDDING.json`). Same envelope, plus a `kind` field. Fetch one facet instead of downloading everything and filtering client-side. |
| `…/by-vendor/<vendor>.json` | **Faceted slice** — the full catalog filtered to one vendor (e.g. `by-vendor/openai.json`). Same envelope, plus a `vendor` field. |
| `…/by-capability/<cap>.json` | **Faceted slice** — filtered to one capability (e.g. `by-capability/reasoning.json`). Same envelope, plus a `capability` field. |
| `…/by-modality/<m>.json` | **Faceted slice** — filtered to one modality present on **input or output** (e.g. `by-modality/image.json`). Same envelope, plus a `modality` field. |
| `…/aliases.json` | **Alias resolution map** — `alias id → { vendor, id }` of the canonical entry, so a consumer can resolve a `-latest`/dated-snapshot alias without scanning every entry. Its own envelope. |
| `…/plans.json` | **Consumer subscription plans** — a *separate* dataset (plans are not models): vendor consumer tiers (Claude, ChatGPT, Gemini) with an **indicative US list price** each. Keyed by consumer brand. A reference only — verify with the vendor. See below. |
| `…/providers.json` | **Pricing-source registry** — each provider's official API-pricing / consumer-plans page, categorized (model creator / hyperscaler / inference provider / aggregator) and cross-linked to its catalog vendor. URLs only — the canonical places to verify indicative prices. See below. |
| `…/endpoints.json` | **Discovery manifest** — a machine-readable map of every published path (absolute URLs): `latest`, `pinned`, `index`, `stats`, `changes`, `feed`, `csv`, `ndjson`, `aliases`, `schema`, `plans` / `providers` (+ their `*Schema` when present), and the available `byKind` / `byVendor` / `byCapability` / `byModality` slice keys. Read this to discover the surface rather than hard-coding paths. |
| `…/badge.json` | **Status badge** — a [shields.io endpoint](https://shields.io/badges/endpoint-badge) payload (`{ schemaVersion, label, message, color }`) so a README can show a live "N models · M vendors" badge. |
| `…/llms.txt` | **`llms.txt` index** — the [llms.txt](https://llmstxt.org) convention: a titled, linked map of the catalog data + every vendor / model page, for assistants and crawlers. |
| `…/models/` | **Per-vendor / per-model pages** — an indexable, quotable URL per model (`models/<vendor>/<slug>.md` + `.html`) and per vendor (`models/<vendor>/`), with the facts in prose. |
| `…/catalog.schema.json` | The JSON Schema (Draft 2020-12) describing the envelope + entry. |
| `…/` (repo Pages root) | Human-browsable reference page (`public/index.html`). |

> **Faceted slices are static, not a query API.** They are pre-computed at publish
> time from the canonical file — `by-kind` / `by-vendor` cover the common facets with
> zero runtime. Arbitrary/compound queries are intentionally **out of scope**: GitHub
> Pages serves static assets only (a dynamic query API would need a separate serverless
> runtime — see the roadmap non-goals). Every slice keeps the same `vendors`-map
> envelope as `catalog.json`, so one parser reads them all, and each still validates
> against the schema.

**Serving.** Hosted on **GitHub Pages**, which serves every asset with
`Access-Control-Allow-Origin: *`, so the endpoint is **CORS-open by default** — no
header config needed. Cache is host-managed. Breaking schema changes bump the
pinned path (`catalog-v2.json`); `catalog.json` always tracks the newest. The files
are regenerated deterministically from the canonical source
(`catalog/model-catalog.json`) on every publish, so they never drift.

## Envelope

```jsonc
{
  "$schema": "https://openviglet.github.io/model-catalog/catalog.schema.json",
  "version": 1,                 // schema major version (integer)
  "lastUpdated": "2026-07-21",  // ISO-8601 date the catalog was regenerated
  "source": "https://openviglet.github.io/model-catalog",
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
| `openWeights` | boolean | — | `true` when the weights are openly downloadable (open-weight), `false` when proprietary API-only. Curated/anchored, omitted when unknown — never guessed. |
| `parameters` | integer | — | Total parameter count, only when the vendor has publicly disclosed it (typical of open-weight models; absent for closed frontier models). Curated/anchored, never guessed. |
| `deprecated` | boolean | — | `true` when the vendor has retired/superseded the id. |
| `maxOutputTokens` | integer | — | Max tokens emittable in one response, when known. |
| `modalities` | object | — | `{ input: string[], output: string[] }` — supported I/O modalities. |
| `knowledgeCutoff` | string | — | Training knowledge cutoff (ISO date or `YYYY-MM`). |
| `releaseDate` | string | — | ISO-8601 date the id became available. |
| `aliases` | string[] | — | Alternate ids that resolve to this model (dated snapshots, `-latest`). |
| `status` | enum | — | `PREVIEW` · `GA` · `DEPRECATED` · `RETIRED` — lifecycle stage; prefer over `deprecated`. |
| `sources` | string[] | — | Provenance — source ids that contributed fields (`openai-api`, `litellm`, `overrides`). |
| `lastVerified` | string | — | ISO-8601 date the entry was last confirmed against its sources. |
| `pricing` | object | — | **Indicative US list price** — `{ inputPer1M, outputPer1M, currency: "USD", unit, indicative: true, note, source, lastVerified }`, per 1,000,000 tokens. **A reference only, not authoritative — verify with the vendor.** Never per-contract/region/negotiated; omitted when no trusted price exists. See below. |
| `benchmarks` | object | — | **Cited third-party capability index** — `{ intelligenceIndex?, arenaElo?, scores?, indicative: true, note?, source, lastVerified }`. A reference to a public leaderboard (Artificial Analysis / LMArena), **not our verdict** — verify at the source. `scores` is an optional per-domain map (`reasoning` / `coding` / `math`). Provenance-gated + never invented; omitted when no cited number exists. See below. |
| `performance` | object | — | **Cited speed metrics** — `{ throughputTps?, latencyTtftSec?, indicative: true, note?, source, lastVerified }`. A second axis (fast vs capable): cited output throughput + time-to-first-token, **not our own benchmark** — verify at the source. Provenance-gated + never invented; omitted when no cited number exists. See below. |

### `pricing` — indicative US list price ⚠️

Optional, and **indicative, not authoritative**: a US **list** price published next to the
model identity as a convenience (so a consumer needn't join to a second source), flagged
`indicative: true` and always carrying a verify-with-vendor `note`. **Always confirm the
live price with the vendor before billing on it** — it is not a billing engine and carries
no per-contract, per-region, negotiated or committed-use pricing. Provenance-gated (`source`
+ `lastVerified` required) and never invented — a model with no trusted price omits the field.

```json
"pricing": {
  "inputPer1M": 3, "outputPer1M": 15,
  "currency": "USD", "unit": "per_1M_tokens",
  "indicative": true,
  "note": "Indicative US list price — verify with the vendor.",
  "source": "litellm", "lastVerified": "2026-07-22"
}
```

### `benchmarks` — cited third-party capability index ⚠️

Optional, and **cited, not our verdict**: a reference to a public, citable capability
leaderboard — an Artificial Analysis Intelligence Index (`intelligenceIndex`) or an LMArena
human-preference rating (`arenaElo`) — published next to the model identity so "how capable"
is a linked third-party number rather than our opinion. Treated exactly like `pricing`:
flagged `indicative: true`, provenance-gated (`source` + `lastVerified` required), never
invented — a model with no cited number omits the field. **Verify at the source.** The optional
`scores` map carries **per-domain** cited scores (recommended keys `reasoning` / `coding` / `math`)
so capability is comparable per use-case rather than one opaque number — each is `{ value,
source?, lastVerified? }`, inheriting the object's `source`/`lastVerified` unless it carries its own.

```json
"benchmarks": {
  "intelligenceIndex": 60,
  "arenaElo": 1300,
  "scores": {
    "reasoning": { "value": 71 },
    "coding": { "value": 68, "source": "SWE-bench", "lastVerified": "2026-07-01" }
  },
  "indicative": true,
  "note": "Cited from Artificial Analysis — verify at the source.",
  "source": "Artificial Analysis", "lastVerified": "2026-07-22"
}
```

### `performance` — cited speed metrics ⚠️

Optional, and **cited, not our benchmark**: a reference to a public speed measurement —
output `throughputTps` (tokens/second, higher = faster) and `latencyTtftSec` (time-to-first-
token in seconds, lower = more responsive) — so the catalog exposes a *second axis* (fast vs
cheap vs capable) alongside `pricing` and `benchmarks`. Same discipline: flagged `indicative:
true`, provenance-gated (`source` + `lastVerified` required), never invented. **Verify at the
source.** The browsable page also derives a **cost-efficiency** figure on the fly (cited
intelligence index ÷ input list price) — a derived view, never a stored field.

```json
"performance": {
  "throughputTps": 180,
  "latencyTtftSec": 0.4,
  "indicative": true,
  "note": "Cited from Artificial Analysis — verify at the source.",
  "source": "Artificial Analysis", "lastVerified": "2026-07-22"
}
```

> **Envelope stays `version: 1`.** All fields below `deprecated` are **optional and
> additive** — existing consumers ignore unknown keys. They are populated by the
> regeneration pipeline ([pipeline.md](./pipeline.md)); hand entries may omit them.

## Usage examples

```bash
# every embedding model across all vendors
curl -s https://openviglet.github.io/model-catalog/catalog-v1.json \
  | jq '.vendors | to_entries[].value[] | select(.kind=="EMBEDDING") | .id'
```

```js
// browser / Node — kind lookup for an arbitrary id
const { vendors } = await (await fetch(
  "https://openviglet.github.io/model-catalog/catalog-v1.json",
)).json()
const all = Object.values(vendors).flat()
const kindOf = (id) => all.find((m) => m.id === id)?.kind ?? "UNKNOWN"
```

## Aggregate metrics (`stats.json`)

A small, separately-shaped artifact (not a `vendors` map) with everything pre-counted,
so a dashboard, a README badge or a coverage view reads one number instead of walking
the whole catalog. Regenerated at emit, so it never drifts. Count maps are ordered by
descending count; `coverage.fields.<field>` is `{ filled, rate }` over all models.

```jsonc
{
  "version": 1,
  "lastUpdated": "2026-07-21",
  "source": "https://openviglet.github.io/model-catalog",
  "totals": { "models": 194, "vendors": 14, "kinds": 8, "capabilities": 4 },
  "byVendor":         { "openai": 129, "gemini": 8, /* … */ },
  "byKind":           { "CHAT": 136, "SPEECH": 22, /* … */ },
  "byCapability":     { "tools": 136, "vision": 101, /* … */ },
  "byInputModality":  { "text": 174, "image": 103, /* … */ },
  "byOutputModality": { "text": 78, "embedding": 15, /* … */ },
  "coverage": {
    "total": 194,
    "fields": { "contextWindow": { "filled": 180, "rate": 0.9278 }, /* … */ }
  }
}
```

## Per-vendor coverage (`coverage.json`)

Trust grows when gaps are visible, not hidden. `coverage.json` breaks the same per-field
fill definition as `stats.json` down **per vendor**, so you can see exactly where the
catalog is thin — "context window known for 82% of vendor X". Every low cell is an
explicit, low-friction invitation to [contribute](../../CONTRIBUTING.md). Its own envelope
(not a `vendors` map); `fields` lists the tracked fields in order; each `fields.<field>` is
`{ filled, rate }` (rate ∈ [0,1]); `byVendor` is ordered by descending model count.

```jsonc
{
  "version": 1,
  "lastUpdated": "2026-07-21",
  "source": "https://openviglet.github.io/model-catalog",
  "fields": ["contextWindow", "maxOutputTokens", "embeddingDimensions", /* … */],
  "overall": { "total": 194, "fields": { "contextWindow": { "filled": 165, "rate": 0.8505 }, /* … */ } },
  "byVendor": {
    "openai": { "total": 129, "fields": { "contextWindow": { "filled": 120, "rate": 0.9302 }, /* … */ } }
    /* … */
  }
}
```

## Change feed (`changes.json` + `feed.xml`)

Knowing *what changed* is a reference's defining value. At every publish, the freshly
built catalog is diffed against the previously published one and the delta is emitted as
`changes.json` (structured) plus an Atom `feed.xml` (subscribable). Diff-at-emit, so it
never drifts from the artifact it describes. The baseline is the prior on-disk build if
present, else the live published `catalog.json` (best-effort — offline/first-publish
degrades to an empty diff, flagged by `"baseline": "none"`). Lifecycle `changed` compares
each id's effective status (`status`, falling back to `deprecated → DEPRECATED`).

```jsonc
{
  "version": 1,
  "lastUpdated": "2026-07-21",
  "source": "https://openviglet.github.io/model-catalog",
  "previousLastUpdated": "2026-07-14",       // null on first publish
  "baseline": "present",                      // "present" | "none"
  "counts": { "added": 2, "removed": 0, "changed": 1 },
  "added":   [ { "vendor": "openai", "id": "…", "kind": "CHAT", "label": "…" } ],
  "removed": [ /* same shape */ ],
  "changed": [ { "vendor": "…", "id": "…", "kind": "…", "label": "…", "from": "PREVIEW", "to": "GA" } ]
}
```

## Consumer subscription plans (`plans.json`) ⚠️

A **separate dataset** from the model catalog — consumer *subscription plans* are not
models, so they do not live in `ModelEntry` or `catalog.json`. `plans.json` publishes the
vendors' consumer tiers (Claude Free/Pro/Max, ChatGPT Free/Plus/Pro, Gemini / Google AI
Pro/Ultra, Z.ai GLM Coding Lite/Pro/Max), **US-only**, keyed by consumer brand. It has its own schema (`plans.schema.json`)
and its own envelope (not a `vendors` map):

```json
{
  "version": 1, "lastUpdated": "2026-07-22",
  "disclaimer": "Indicative US consumer subscription plans — a reference only …",
  "plans": {
    "anthropic": [
      { "id": "claude-pro", "name": "Claude Pro", "product": "Claude", "tier": "pro",
        "priceMonthlyUSD": 20, "annualMonthlyUSD": 17, "currency": "USD",
        "features": ["…"], "url": "https://www.anthropic.com/pricing",
        "indicative": true, "note": "Indicative US list price — verify with the vendor.",
        "source": "https://www.anthropic.com/pricing", "lastVerified": "2026-07-22" }
    ],
    "openai": [ /* … */ ], "google": [ /* … */ ]
  }
}
```

Every price is an **indicative US list price** — the same bounds as per-model `pricing`:
a reference only, **not authoritative**, excludes tax, may be stale and vary by region;
**verify on the vendor's pricing page** before relying on it. Provenance-gated (`source`
+ `lastVerified` + `indicative: true` required per plan) and never invented. Hand-curated
and review-gated — there is no upstream API for consumer plans. Each plan is flattened with
its `vendor` in the published artifact. The section is omitted if `catalog/plans.json` is absent.

## Pricing-source registry (`providers.json`)

The counterpart to the *indicative* prices: `providers.json` lists each AI provider and its
**official pricing pages**, so every "verify with the vendor" caveat has a canonical link.
It carries **URLs only, no prices** — the catalog's own per-model `pricing` (and `plans.json`)
are the indicative references; these are the authoritative places to confirm them. Its own
schema (`providers.schema.json`) and envelope:

```json
{
  "version": 1, "lastUpdated": "2026-07-22",
  "providers": [
    { "id": "openai", "name": "OpenAI (GPT)", "category": "model-creator",
      "catalogVendor": "openai",
      "apiPricingUrl": "https://openai.com/api/pricing/",
      "consumerPlansUrl": "https://openai.com/chatgpt/pricing/" },
    { "id": "groq", "name": "Groq", "category": "inference-provider",
      "catalogVendor": null, "apiPricingUrl": "https://groq.com/pricing/" }
  ]
}
```

`category` ∈ `model-creator` · `hyperscaler` · `inference-provider` · `aggregator`.
`catalogVendor` is the catalog vendor key whose models this provider serves, or `null` when
the provider is not (yet) represented in the catalog. Hand-curated and review-gated. The
section is omitted if `catalog/providers.json` is absent.

## Alternate export formats (`catalog.csv` + `catalog.ndjson`)

Both are emitted from the same flattened entries as `catalog.json`, in the same order, so
they never drift. **`catalog.csv`** is one row per model, drawn from this superset of columns
(in this order) —
`vendor,id,label,kind,contextWindow,maxOutputTokens,embeddingDimensions,capabilities,openWeights,parameters,inputModalities,outputModalities,knowledgeCutoff,releaseDate,status,deprecated,aliases,sources,lastVerified,priceInputPer1M,priceOutputPer1M,priceCurrency,priceSource,priceLastVerified,benchmarkIntelligenceIndex,benchmarkArenaElo,benchmarkReasoning,benchmarkCoding,benchmarkMath,benchmarkSource,benchmarkLastVerified,perfThroughputTps,perfLatencyTtftSec,perfSource,perfLastVerified`
(the `price*` columns are the indicative US list price — a reference only, verify with the vendor; the `benchmark*` / `perf*` columns are cited third-party figures — verify at the source).
For **data hygiene**, any *optional* column that is empty for **every** model in a given publish
is omitted from that CSV (the identity columns `vendor,id,label,kind` are always present); a
column reappears automatically once any model carries a value — so read the header row, don't
assume a fixed position. Array fields are `;`-joined, RFC-4180 quoted. **`catalog.ndjson`** is
one JSON object per line (the flattened `ModelEntry`, including `vendor`), newline-delimited.

```bash
# every reasoning-capable chat model, as a table
curl -s https://openviglet.github.io/model-catalog/catalog.csv \
  | awk -F, 'NR==1 || ($4=="CHAT" && $8 ~ /reasoning/)'

# stream every embedding model's id + dimensions
curl -s https://openviglet.github.io/model-catalog/catalog.ndjson \
  | jq -c 'select(.kind=="EMBEDDING") | {id, embeddingDimensions}'
```

## Status badge (`badge.json`)

`badge.json` is a [shields.io endpoint](https://shields.io/badges/endpoint-badge) payload,
so any README can render a live badge that always reflects the current totals (read from
the same numbers as `stats.json`, computed at emit):

```markdown
![Model Catalog](https://img.shields.io/endpoint?url=https://openviglet.github.io/model-catalog/badge.json)
```

```jsonc
{ "schemaVersion": 1, "label": "Model Catalog", "message": "194 models · 14 vendors", "color": "ea580c", "cacheSeconds": 3600 }
```

## Citability pages (`llms.txt` + `models/`)

For the catalog to be *cited* — by assistants and search engines — its facts must be
crawlable and quotable, not locked inside a JSON blob. So each publish also emits, from the
same flattened entries:

- **`llms.txt`** — an [llms.txt](https://llmstxt.org)-convention index at the site root: a
  title, a one-line summary, then linked sections for the catalog data, every vendor, and
  every model.
- **`models/<vendor>/<slug>.md` + `.html`** — a page per model with a prose summary and a
  facts table (context window, modalities, capabilities, provenance…). Model ids are slugged
  to safe file names (`:`/`/` → `-`), memoized so links and files agree.
- **`models/<vendor>/`** (index) and **`models/`** — vendor and all-vendor index pages.

The Markdown pages are the quotable primary artifact; the HTML pages give each a crawlable,
canonical, meta-described rendering. All derived at emit, so a page can never state a fact
the catalog doesn't.

## How consumers use it

Any tool can fetch the endpoint directly. **Viglet Turing ES** fetches
`turing.model-catalog.url` (default the rolling endpoint) with an ETag/TTL cache
as its model-picker catalog. The live per-vendor `/v1/models` listing path and
Turing's metadata-first kind classification are unchanged — the public catalog only
provides the static reference.

## Relationship to other artifacts

- **Source of truth:** `catalog/model-catalog.json` in this repo; this doc is its
  published contract.
- **Regeneration:** [pipeline.md](./pipeline.md) — the multi-source, propose-and-review pipeline.
- **Positioning:** [STRATEGY.md](../STRATEGY.md) §I (why this is a discoverability asset).
