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
>
> **Block J — Live benchmark & performance ingestion** shipped in full — the live
> Artificial Analysis source that auto-refreshes the T41 `benchmarks` + `performance`
> fields over the network (curated slug→id matching table, offline-replayable,
> provenance-stamped, propose-and-review) (see [CHANGELOG.md](CHANGELOG.md) → Block J).
>
> **Block K — Client SDK modernization** shipped in full — the three SDKs
> (JS/TS · Python · Java) brought back to parity with the published contract: typed new
> `ModelEntry` fields (T46), aggregate/registry accessors (stats/coverage/providers/plans/
> aliases, T47), faceted-slice + change-feed accessors + a refreshed endpoints manifest
> (T48), and the shared derived `classify()` use-case-tag + price-tier helper (T49) (see
> [CHANGELOG.md](CHANGELOG.md) → Block K). The endpoint intentionally stays on its public
> GitHub Pages URL (`openviglet.github.io/model-catalog`) — an unbranded, community-owned
> home signals a public resource, not a brand asset.

## Block G — Static-site expansion & indexing

> The SPA is already complemented by per-model/per-vendor static pages (T26); extend
> that **zero-dep** emit path rather than adopting a framework. Next.js was considered
> and **rejected** — it would break the foundational zero-dependency bet to solve a
> problem `emit.mjs` already solves. Design rationale → §G.

- **T34** 📋 **Per-segment hubs + sitemap** — evolve the T26 page generator in `scripts/emit.mjs` into real per-capability / per-modality / per-kind (+ per-tier) **hubs**: each a compact static leaderboard (top models pre-sorted, cross-linked to per-model pages) + prose intro + links to the JSON slice and to Explore pre-filtered — *not* a bare link list — plus `sitemap.xml` + `robots.txt`. Serves humans and crawlers; zero-dep, derived-at-emit, no framework. deps: — (T26 shipped) → §G1
- **T58** 📋 **First-class per-model page** — promote the emitted per-model page (T26) from a bare table into a scannable reference styled to the SPA design tokens: header + at-a-glance stat tiles + populated-only cited sections + always-on provenance + derived related models; omit empty sections (not "—"); the drawer gains an "Open full page ↗" link. Unifies the SPA↔static visual system. deps: — (T26 shipped) → §G2

## Block L — Explore & decide: catalog data experience

> Rich per-model data (pricing, cited benchmarks + scores, speed, open-weights, classification)
> across ~240 models now outgrows a vendor-grouped list that can only sort *within* a vendor — the
> cross-vendor questions ("cheapest chat overall", "best intelligence-per-$") are impossible, and
> the home page is accreting analytics bands. This block turns the site from an inventory into a
> **decision tool** across three jobs — orient / explore / cite (the cite surface is Block G) —
> without one hyper-page. **Foundational bet:** the site becomes the reference consumer of the JS
> SDK — gaps found here are fixed in the SDK (feeding Block K), never worked around in the page.
> Sparse data stays honest (denominators, opt-in overlays, never invented). Design rationale → §L.

- **T53** 📋 **Honest sparsity + data hygiene** — "has price/benchmark/speed" filters, denominators on every ranked/plot view, dimmed empty cells + contribute deep-link, contribute empty-states; and stop advertising 0%-filled fields (drop empty CSV cols / hide all-zero coverage cols / remove reasoning+arenaElo scaffolding; add missing COV_LABEL). deps: T51 → §L4
- **T54** 💭 **Decision views: frontier + leaderboards** — hand-rolled inline-SVG price×intelligence Pareto scatter (over the ~32 chat models with both) + precomputed `leaderboards.json` (cheapest per kind, best intelligence-per-$, biggest context, fastest), each carrying its population/total. deps: T51, T53 → §L5
- **T55** 📋 **IA re-layout (orient/explore/cite)** — home becomes orient-only (+ prominent Explore entry); move Insights/Coverage/Plans/Sources off the critical path into one tabbed analytics home; trim the nav toward four bands. Pure IA, no new data. deps: — → §L6
- **T56** 💭 **Facet rail + shareable presets** — grouped/collapsible facet rail with per-chip match counts + "clear all" + labelled AND/OR; "copy link to this view" + curated preset links. deps: T51, T52 → §L7
- **T57** 💭 **Mobile & render performance** — restore mobile nav (compact menu), card view < 720px, debounce the keystroke re-render. deps: T51 → §L8

## Non-goals

- **Pricing is bounded to an indicative US list price.** As of the STRATEGY §I reversal (Block F) the catalog carries an *optional* per-token US **list** price — flagged **indicative, not authoritative** (a reference only, verify with the vendor), provenance-gated and never invented. It is **not** a billing engine: no per-contract, per-region, negotiated or committed-use pricing.
- **No runtime dependency on the pipeline.** It is a local maintenance tool; consumers read the published JSON, not the pipeline.
- **No auto-overwrite / no CI auto-merge.** Regeneration is always propose-and-review (`--apply` only); CI may open a PR but never merges it.
- **No envelope-shape break.** `version` stays `1` — new fields are optional and additive.
