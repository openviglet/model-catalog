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
>
> **Block L — Explore & decide: catalog data experience** shipped in full — the site
> became a cross-vendor **decision tool** and the reference consumer of the JS SDK: the
> page dogfoods `@openviglet/model-catalog-client` as self-hosted ESM (T50), Browse is a
> flat globally-sorted table with optional group-by (T51), aligned sortable decision
> columns + a URL-persisted column chooser (T52), honest-sparsity filters/empty-states +
> self-dropping empty CSV columns (T53), a price×intelligence frontier scatter +
> `leaderboards.json` + a tri-SDK `leaderboards()` accessor (T54), a tabbed analytics home
> off the critical path with a four-band nav (T55), a grouped facet rail with counts +
> shareable presets (T56), and mobile nav + card view + debounced render (T57)
> (see [CHANGELOG.md](CHANGELOG.md) → Block L).

> **Block N — Page as a typed module bundle** shipped in full — the ~2,650-line inline
> `index.html` was extracted into small TypeScript ES-modules under `src/page/`
> (compiled by `tsc` → gitignored `public/app/`), its CSS to committed
> `public/styles.css`; the page now links the stylesheet and loads `./app/main.js`.
> A **deliberate, documented reversal** of the page's zero-*build* stance — the page
> gains one dev dependency (`typescript`) while the pipeline and SDKs stay strictly
> zero-dependency (see [CHANGELOG.md](CHANGELOG.md) → Block N).

## Block G — Static-site expansion & indexing

> The SPA is already complemented by per-model/per-vendor static pages (T26); extend
> that **zero-dep** emit path rather than adopting a framework. Next.js was considered
> and **rejected** — it would break the foundational zero-dependency bet to solve a
> problem `emit.mjs` already solves. Design rationale → §G.

- **T34** 📋 **Per-segment hubs + sitemap** — evolve the T26 page generator in `scripts/emit.mjs` into real per-capability / per-modality / per-kind (+ per-tier) **hubs**: each a compact static leaderboard (top models pre-sorted, cross-linked to per-model pages) + prose intro + links to the JSON slice and to Explore pre-filtered — *not* a bare link list — plus `sitemap.xml` + `robots.txt`. Serves humans and crawlers; zero-dep, derived-at-emit, no framework. deps: — (T26 shipped) → §G1
- **T58** 📋 **First-class per-model page** — promote the emitted per-model page (T26) from a bare table into a scannable reference styled to the SPA design tokens: header + at-a-glance stat tiles + populated-only cited sections + always-on provenance + derived related models; omit empty sections (not "—"); the drawer gains an "Open full page ↗" link. Unifies the SPA↔static visual system. deps: — (T26 shipped) → §G2

## Block M — Conversational catalog: ask the catalog, get cited answers

> The catalog is a *reference*; the highest-value questions over it are comparative
> and numeric ("cheapest embedding model with ≥1M context", "open-weight chat under
> $0.50/1M with tools") — exactly what a **vectorless / structured-data RAG** answers
> well and a vector store answers badly. This block makes the reference *askable*
> without breaking the foundational bets: the site stays **static + zero-dep** (no
> server, no LLM here), so the RAG/LLM runs on a **separate backend** — Viglet
> Turing ES's grounded catalog copilot (`POST /api/sn/{site}/copilot`, vectorless +
> cited), hosted on `turing-demo.viglet.org`. This repo's job is to emit the two
> artifacts that make the catalog answerable and to add an optional widget that
> renders **grounded answers with cited model deep-links**. Answers are never
> invented — they cite `id`s that resolve to per-model pages/the drawer, consistent
> with the provenance-first bet. Serves the **orient** job (§L) and the GEO thesis
> (STRATEGY §I — be the thing assistants cite). Design rationale → §M.

- **T59** ✅ **Structured-RAG field manifest** — emit `models/query-manifest.json`: a per-field descriptor over the flat record shape already emitted as `catalog.ndjson` (field name, type STRING/NUMBER/BOOL/ARRAY, facetable, enum value sets for vendor/kind/capabilities/modalities/tier, numeric min–max for context/output/pricing, canonical sort keys, human description). The contract an external structured/vectorless RAG (Turing's catalog copilot) declares its field schema from and constrains NL→filter against — no guessed or hallucinated fields. Derived-at-emit, zero-dep, additive. deps: — → §M1
- **T60** ✅ **LLM context bundle (stuff-all + GEO)** — emit `models/context.txt`: a compact, token-budgeted digest (a header describing the columns + `lastUpdated` + the indicative/verify caveats, then one line per model with the decision fields — id, vendor, kind, context, max output, price in/out, tier, key capabilities, headline benchmark, open-weights). Sized to fit a small context window (target ≤ ~40k tokens) for the "no-retrieval, stuff the whole catalog" vectorless mode and as an assistant-ingestible GEO artifact (complements the T26 `llms.txt`). deps: — → §M2
- **T61** 📋 **"Ask the catalog" widget** — an optional chat box on the SPA (orient surface) that POSTs a question to a configurable structured-RAG endpoint (`data-ask-endpoint`; default the `turing-demo.viglet.org` catalog copilot `POST /api/sn/{site}/copilot`) and renders the grounded answer with **cited model deep-links** — mapping returned citation `id`s to per-model pages / the T17 drawer. No API key in the page (the backend holds it); the section hides entirely when no endpoint is configured, keeping the static site self-contained + zero-dep (inline JS). deps: T59, T60 → §M3

## Non-goals

- **Pricing is bounded to an indicative US list price.** As of the STRATEGY §I reversal (Block F) the catalog carries an *optional* per-token US **list** price — flagged **indicative, not authoritative** (a reference only, verify with the vendor), provenance-gated and never invented. It is **not** a billing engine: no per-contract, per-region, negotiated or committed-use pricing.
- **No runtime dependency on the pipeline.** It is a local maintenance tool; consumers read the published JSON, not the pipeline.
- **No auto-overwrite / no CI auto-merge.** Regeneration is always propose-and-review (`--apply` only); CI may open a PR but never merges it.
- **No envelope-shape break.** `version` stays `1` — new fields are optional and additive.
