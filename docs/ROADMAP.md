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
> **Block G — Static-site expansion & indexing** shipped in full — per-segment leaderboard
> hubs (per kind / capability / modality / price tier, each a ranked table cross-linked to
> per-model pages + Explore deep-links), `sitemap.xml` + `robots.txt` (T34), and the
> first-class per-model page — SPA-token-styled header + stat tiles + populated-only cited
> sections + provenance + related models, with an "↗ Full page" link from the drawer (T58).
> Extends the zero-dep `emit.mjs` generator; Next.js was rejected (see
> [CHANGELOG.md](CHANGELOG.md) → Block G).
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

> **Block M — Conversational catalog** shipped in full — the reference became
> *askable* with cited answers, without breaking the static + zero-dep bets: the
> `query-manifest.json` field/facet/enum/range contract a vectorless RAG declares its
> schema from (T59), the token-budgeted `context.txt` stuff-all digest (T60), the
> optional **"Ask the catalog"** widget that POSTs to a configurable structured-RAG
> endpoint and renders grounded answers with cited model deep-links (T61), and the
> committed `qa-eval.jsonl` grounded-answer eval set + drift check that seeds the
> widget's example prompts (T62). The LLM/RAG runs on a **separate backend** (Viglet
> Turing ES's catalog copilot on `turing-demo.viglet.org`) — no server or key here
> (see [CHANGELOG.md](CHANGELOG.md) → Block M).

> **Block N — Page as a typed module bundle** shipped in full — the ~2,650-line inline
> `index.html` was extracted into small TypeScript ES-modules under `src/page/`
> (compiled by `tsc` → gitignored `public/app/`), its CSS to committed
> `public/styles.css`; the page now links the stylesheet and loads `./app/main.js`.
> A **deliberate, documented reversal** of the page's zero-*build* stance — the page
> gains one dev dependency (`typescript`) while the pipeline and SDKs stay strictly
> zero-dependency (see [CHANGELOG.md](CHANGELOG.md) → Block N).

> **Block O — Browse at scale** shipped in full — Browse was reworked for 246+
> models without new dependencies: client-side pagination (50/page with a windowed
> pager, page reset on any filter/sort/search change, grouped views left unpaged)
> (T67); then the fixed-column table — whose columns overflowed and clipped price —
> became a **responsive card grid**, each card showing all of a model's recorded
> fields, with sorting moved to an explicit field + direction control and the filter
> rail collapsed by default (T68) (see [CHANGELOG.md](CHANGELOG.md) → Block O).
>
> **Block P — Trust, compliance & project health** shipped in full — non-code
> hardening from an outside legal/OSS-analyst review: neutral wording
> ("cheapest" → "Lowest price" labels, board ids kept) (T71), a trademark /
> non-affiliation notice on the site + emitted pages (T72), an explicit **CC-BY
> 4.0** data licence distinct from the Apache-2.0 code + a no-accuracy warranty
> (T73), an Ask-widget privacy note disclosing the one surface that leaves the
> page (T74), self-hosted web fonts dropping the runtime Google Fonts request
> (T75), and the community-health/governance files SECURITY.md +
> CODE_OF_CONDUCT.md + GOVERNANCE.md (T76). All respect the guardrails — zero
> runtime dependency, no envelope break, propose-and-review (see
> [CHANGELOG.md](CHANGELOG.md) → Block P).

_No active backlog — the next block starts at letter **Q** (see
[last-task.md](last-task.md))._

## Non-goals

- **Pricing is bounded to an indicative US list price.** As of the STRATEGY §I reversal (Block F) the catalog carries an *optional* per-token US **list** price — flagged **indicative, not authoritative** (a reference only, verify with the vendor), provenance-gated and never invented. It is **not** a billing engine: no per-contract, per-region, negotiated or committed-use pricing.
- **No runtime dependency on the pipeline.** It is a local maintenance tool; consumers read the published JSON, not the pipeline.
- **No auto-overwrite / no CI auto-merge.** Regeneration is always propose-and-review (`--apply` only); CI may open a PR but never merges it.
- **No envelope-shape break.** `version` stays `1` — new fields are optional and additive.
