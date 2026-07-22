# Model Catalog — Design rationale (IMPROVEMENTS)

> The *what/why* for **unshipped** sections only. No status tables, no shipped
> implementation reports (those live in `git log` + [CHANGELOG.md](CHANGELOG.md)).
> Status lives only in [ROADMAP.md](ROADMAP.md).

> **Guardrails these all respect.** **Zero npm dependency** (Node built-ins + inline
> HTML/CSS/JS only), no runtime / server-side query, propose-and-review only, and no
> envelope-shape break (`version` stays `1` — new fields optional and additive). Pricing
> is now in scope but **bounded** to an *indicative US list price* (STRATEGY §I, reversed
> by Block F). Consumer artifacts stay *derived* from the canonical file at emit time, so
> they can never drift from the source of truth.

## §G — Static-site expansion & indexing

The goal — segmented, individually-indexable static pages instead of one SPA — is largely
met already by T26 (per-model/per-vendor pages + `llms.txt`). The scalable path is to
**extend the zero-dep `emit.mjs` generator**, not adopt a framework: Next.js was weighed
and rejected because it would break the foundational zero-dependency bet to solve a
problem the emit path already solves (generating static files from a JSON is a loop, not a
framework need).

### §G1 — T34 · More static landing pages + sitemap
Extend `emit.mjs` with per-capability / per-modality / per-kind landing pages and a
`sitemap.xml` (+ `robots.txt`), so faceted slices become crawlable URLs and the catalog is
easier for search engines and assistants to index and cite. Derived-at-emit like every
other artifact, so it can't drift; zero-dep, no framework.

## §J — Live benchmark & performance ingestion

### §J1 — T45 · Live benchmark/performance source (auto-refresh T41)
T41 proved the data path but leaves population **manual** — a maintainer hand-edits
`pipeline/benchmarks.json`. The next step is to fetch the numbers directly from a public,
citable leaderboard (Artificial Analysis, LMArena, or similar) so `benchmarks` + `performance`
refresh without manual editing, reusing T41's fail-safe matching (leaderboard name → catalog
vendor/id; omit rather than mis-attribute) and its exact output shape. Exploratory (💭) because
it hinges on a source with **(a)** an acceptable licence to republish cited numbers and **(b)** a
stable, fetchable shape (an open API/export beats a scrape). Cached as an offline-replayable
snapshot + propose-and-review like every other source, so a bad or stale fetch never silently
publishes — and, since the numbers are still *cited*, the "verify at the source" framing is
unchanged; this only automates how the snapshot is filled.

## §K — Client SDK modernization

The three SDKs were built early (Block B, T9–T11) and froze at that surface: a `ModelEntry`
that ends at `lastVerified`, plus loaders for `catalog`/`index`/`by-kind`/`by-vendor`/`endpoints`
only. Six-plus catalog releases later (Blocks D–I) the published contract has grown a lot —
pricing, benchmarks/scores, performance, open-weights/parameters facts, and a family of
discovery artifacts (stats, coverage, providers, plans, aliases, capability/modality slices, a
change feed). A consumer *can* still reach the new model fields through the unknown-field
tolerance each client already has (`[key: string]: unknown` / `.extra` / `extra()`), and can
hand-roll the new endpoint URLs, but that defeats the point of a typed client. This block closes
the gap so the SDKs are a faithful, typed mirror of the current contract again.

**Split by feature, not by language.** The three clients deliberately share one surface (their
READMEs say so); updating them one language at a time would let that surface drift between
commits. Each task instead lands the same capability across JS + Python + Java together. All work
here is additive, read-only and zero-dep — no new schema, no envelope-shape change — and the
existing T13 publish workflows (auto-incrementing patch) ship the result, so no new release
plumbing is needed.

### §K1 — T46 · Typed new `ModelEntry` fields
Add the Block F/I additive fields to each client's model type: `pricing`, `benchmarks` (with the
per-domain `scores` map), `performance`, `openWeights`, `parameters`. Nested objects get proper
types (`Pricing`/`Benchmarks`/`Performance`) in the typed languages; Python extends `_FIELD_MAP`
and Java extends the `KNOWN` set so the fields stop landing in the untyped bucket. Unknown-field
tolerance stays intact for the *next* additive field. A fixture carrying the new fields, parsed
in a unit test per client, guards the mapping.

### §K2 — T47 · Aggregate & registry endpoint accessors
The clients expose the catalog and its facet slices but none of the aggregate/registry artifacts
emitted since. Add typed read-only loaders for `stats.json`, `coverage.json`, `providers.json`,
`plans.json` and `aliases.json`, each returning the published shape. These are separate documents
(not `ModelEntry` lists), so they get their own methods and return types rather than folding into
the flatten path.

### §K3 — T48 · Faceted-slice + change-feed accessors + manifest refresh
Round out endpoint parity: `fetchByCapability` / `fetchByModality` mirror the existing
`fetchByKind` / `fetchByVendor` slice loaders, and a `changes.json` accessor exposes the change
feed. The discovery-manifest type (`EndpointsManifest` and its peers) is stale — extend it with
every key `endpoints.json` now advertises so the manifest a client returns matches what the
endpoint actually serves.

### §K4 — T49 · Shared use-case-tag + price-tier classifier
The browsable page derives at-a-glance *use-case tags* (from kind/capabilities/modalities) and a
price-bucketed *tier* client-side via `classify()` (T38). That logic is useful to any consumer,
not just the page. Port it into each SDK as an optional derived helper so consumers get the same
categorization without re-implementing it. Purely derived from fields already present — no
schema or contract change — hence exploratory (💭): the open question is keeping one classifier
definition in step across four implementations (page + three SDKs). Depends on T46 so the tier
logic can read a typed `pricing`.
