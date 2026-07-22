# Model Catalog — Roadmap (active backlog)

> **Single source of truth for task status.** Flat, one line per task.
> Only **unshipped** work lives here (📋 designed · 💭 idea · ⏳ partial · 🛠 in-progress).
> Shipped work moves to [CHANGELOG.md](CHANGELOG.md); design rationale (the
> *what/why* per task) lives in [IMPROVEMENTS.md](IMPROVEMENTS.md); strategy/positioning
> lives in [STRATEGY.md](STRATEGY.md).
>
> **How to pick work:** lowest-numbered task in a block whose `deps` are all shipped.
> The `→` pointer is the section in IMPROVEMENTS.md with the full design. The next
> free `T<n>` lives in [last-task.md](last-task.md).

| Symbol | Meaning |
|---|---|
| 📋 | Designed but not started |
| 💭 | Idea worth exploring; needs design |
| ⏳ | Partial — direction is right, more work remains |
| 🛠 | In progress |

> **Block A — Catalog API + regeneration pipeline** shipped in full — the canonical
> catalog, schema, multi-source regeneration pipeline, emit step and the browsable
> public API (see [CHANGELOG.md](CHANGELOG.md) → Block A; migrated from Viglet Turing ES).
>
> **Block B — Client libraries / SDKs** shipped in full (JS/TS · Python · Java) — see
> [CHANGELOG.md](CHANGELOG.md) → Block B.
>
> **Block C — Web experience & discoverability** shipped in full — permalinks + URL
> state, detail drawer, comparison view, command palette, capability/modality filters +
> sortable columns, and the insights dashboard (see [CHANGELOG.md](CHANGELOG.md) → Block C).
>
> **Block D — API surface expansion** shipped in full — the change feed (changes.json +
> Atom feed.xml), CSV/NDJSON exports, stats.json, capability/modality slices + aliases.json,
> the GEO/citability layer (llms.txt + per-vendor/model pages) and the embeddable badge
> (see [CHANGELOG.md](CHANGELOG.md) → Block D).
>
> **Block E — Community & contribution** shipped in full — the "propose a model" flow
> (issue form + CONTRIBUTING + site Contribute section with per-model deep links) and the
> per-vendor coverage/gaps view (coverage.json + heatmap) (see [CHANGELOG.md](CHANGELOG.md)
> → Block E).
>
> **Block F — Cost & commercial offerings** shipped in full — the optional indicative
> US-list `pricing` field + schema, LiteLLM pricing enrichment (161 models), pricing
> surfaced across every artifact, and the separate consumer-plans dataset (plans.json)
> (see [CHANGELOG.md](CHANGELOG.md) → Block F).
>
> **Block H — Provider coverage & pricing sources** shipped in full — the provider
> pricing-source registry (providers.json) and onboarding 8 new provider vendors
> (Groq, Together, Fireworks, Cerebras, Qwen, Azure + the OpenRouter/Vercel gateways
> with a curated cap) → 22 vendors / 240 models (see [CHANGELOG.md](CHANGELOG.md) → Block H).
>
> **Block I — Model classification & discovery** shipped in full — factual fields
> (`openWeights` + `parameters`), the cited `benchmarks` object + per-domain scores and
> its curated-snapshot source adapter, the cited `performance` (speed) axis + derived
> cost-efficiency view, and page filter/sort by use-case tag + price tier (see
> [CHANGELOG.md](CHANGELOG.md) → Block I).

## Block G — Static-site expansion & indexing

> The SPA is already complemented by per-model/per-vendor static pages (T26); extend
> that **zero-dep** emit path rather than adopting a framework. Next.js was considered
> and **rejected** — it would break the foundational zero-dependency bet to solve a
> problem `emit.mjs` already solves. Design rationale → §G.

- **T34** 📋 **More static landing pages + sitemap** — extend `scripts/emit.mjs` (the T26 page generator) with per-capability / per-modality / per-kind static landing pages and a `sitemap.xml` (+ `robots.txt`) so segmented content is individually indexable by search engines and assistants. Zero-dep, derived-at-emit, no framework. deps: — (T26 shipped) → §G1

## Block J — Live benchmark & performance ingestion

> T41 populates the cited `benchmarks`/`performance` fields from a hand-curated snapshot
> (`pipeline/benchmarks.json`). This block **automates that refresh** — fetch a public,
> citable leaderboard directly so the numbers stay current without manual editing,
> subject to a workable source + licence. Design rationale → §J.

- **T45** 💭 **Live benchmark/performance source (auto-refresh T41)** — extend the T41 benchmark adapter to fetch a public, citable capability/speed leaderboard (e.g. Artificial Analysis / LMArena) over the network into the `benchmarks` + `performance` fields, matched to catalog ids, cached as an offline-replayable snapshot and provenance-stamped — replacing manual snapshot edits with a dynamic refresh. Gated on a source with an acceptable licence + stable shape; fail-safe matching (omit, never mis-attribute) + propose-and-review like every source. deps: T41 → §J1

## Block K — Client SDK modernization

> The three client SDKs (JS/TS · Python · Java) shipped in Block B (T9–T11) and still
> expose only that original surface — their `ModelEntry` stops at `lastVerified` and they
> know only `catalog`/`index`/`by-kind`/`by-vendor`/`endpoints`. Everything added since
> (Block F pricing, Block I classification fields, and the Block D/E/H discovery artifacts)
> is reachable only as untyped pass-through, if at all. This block brings all three back to
> parity with the published contract. **Split by feature, not by language** — each task
> updates JS + Python + Java together so the shared surface never diverges. Additive,
> read-only, zero-dep. Design rationale → §K.

- **T46** 📋 **Typed new `ModelEntry` fields across all three SDKs** — model the Block F/I additive fields (`pricing`, `benchmarks` incl. per-domain `scores`, `performance`, `openWeights`, `parameters`) in the JS `index.d.ts`, the Python dataclass (+ `_FIELD_MAP`), and the Java `ModelEntry` record (+ `KNOWN` set + nested `Pricing`/`Benchmarks`/`Performance` types), preserving unknown-field tolerance; refresh the three READMEs and add a fixture-based unit test per client. deps: — (Blocks B/F/I shipped) → §K1
- **T47** 📋 **Aggregate & registry endpoint accessors across all three SDKs** — add read-only loaders for the discovery/aggregate artifacts the clients don't yet expose: `stats.json` (T24), `coverage.json` (T29), `providers.json` (T35), `plans.json` (T33) and `aliases.json` (T25), with typed returns mirroring the published shapes; tests + README per client. deps: — → §K2
- **T48** 📋 **Faceted-slice + change-feed accessors + manifest refresh across all three SDKs** — add `fetchByCapability` / `fetchByModality` slice loaders (T25) and a `changes.json` change-feed accessor (T22), and extend the `EndpointsManifest`/equivalent type with every new discovery key (byCapability, byModality, aliases, stats, coverage, providers, plans, changes, feed, csv, ndjson, badge, llms). deps: — → §K3
- **T49** 💭 **Shared use-case-tag + price-tier classifier in the SDKs** — port the page's client-side `classify()` (T38) into each SDK as an optional *derived* helper (use-case tags from kind/capabilities/modalities + price-bucketed tier), so consumers get the same at-a-glance categorization without re-implementing it; derived-only, no schema/contract change. deps: T46 → §K4

> The endpoint intentionally stays on its public GitHub Pages URL
> (`openviglet.github.io/model-catalog`) — an unbranded, community-owned home signals
> it is a public resource, not a brand asset.

## Non-goals

- **Pricing is bounded to an indicative US list price.** As of the STRATEGY §I reversal (Block F) the catalog carries an *optional* per-token US **list** price — flagged **indicative, not authoritative** (a reference only, verify with the vendor), provenance-gated and never invented. It is **not** a billing engine: no per-contract, per-region, negotiated or committed-use pricing.
- **No runtime dependency on the pipeline.** It is a local maintenance tool; consumers read the published JSON, not the pipeline.
- **No auto-overwrite / no CI auto-merge.** Regeneration is always propose-and-review (`--apply` only); CI may open a PR but never merges it.
- **No envelope-shape break.** `version` stays `1` — new fields are optional and additive.
