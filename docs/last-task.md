# Last task number — `T34` · next block letter — `H`

> **Single source of truth for the next free task number.** The next new task is
> `T30`; after assigning it, bump the number above and the log line below.
>
> T-numbers are **non-contiguous across blocks** — never infer the next number
> from a block's header range or a `git log` scan. This counter is authoritative.
> The block letter has the same hazard: **`CHANGELOG.md` is authoritative for the
> real maximum block**, not `ROADMAP.md` (which lists only unshipped work).

## Rule

1. **Before creating a task**, read the number above and use `T<n+1>`.
2. **After creating it**, increment the number above and append a log line below.
3. Never infer the next number from a block header range or a `git log` scan.
4. **Before creating a new block**, use the next block letter above; confirm the
   real maximum by grepping `CHANGELOG.md`, then bump the letter after creating it.

## Log (most recent first)

- **T33 SHIPPED** (Block F §F4 — consumer plans dataset: separate catalog/plans.json + plans.schema.json (plans aren't models), envelope keyed by brand, provenance-gated Plan {id,name,tier,priceMonthlyUSD,indicative,source,lastVerified}; seeded big-3 US plans (10/3 — Claude/ChatGPT/Gemini); emit reads+validates+flattens+publishes plans.json + endpoints/llms.txt; page Consumer plans section + api.md section. **Block F shipped in full.**) — 2026-07-22.
- **T32 SHIPPED** (Block F §F3 — surface pricing across artifacts: page row chip + drawer + compare + coverage heatmap col + marketing text; emit CSV price* cols + per-model page price row + COVERAGE_FIELDS pricing (stats+coverage) + vendor/llms.txt blurbs; api.md pricing field+subsection; JS/Python/Java READMEs; NDJSON/catalog automatic; indicative-verify caveat on every surface) — 2026-07-22.
- **T31 SHIPPED** (Block F §F2 — pipeline pricing enrichment: litellm adapter maps `*_cost_per_token`→`pricing` (per-1M USD, indicative, source litellm); merge carries pricing as highest-wins object (enrich-blank-then-stable, overrides pin corrects, stamps lastVerified); validate CMP_FIELDS+pricing; offline --apply populated 161 entries, 0/0/161 diff; 2 new tests) — 2026-07-22.
- **T30 SHIPPED** (Block F §F1 — pricing field + schema, STRATEGY §I reversal: optional `pricing{inputPer1M,outputPer1M,currency:USD,unit,indicative:const true,note,source,lastVerified}`, required indicative+source+lastVerified; validate.mjs `pricingErrors()` mirror + 2 tests; additive, version 1; no prices seeded [T31 populates]) — 2026-07-22.
- **T34 CREATED** (📋, Block G §G1 — more static landing pages: per-capability/modality/kind pages + sitemap.xml/robots.txt via emit.mjs; Next.js rejected for zero-dep; deps — [T26 shipped]) — 2026-07-22.
- **T33 CREATED** (💭, Block F §F4 — provider consumer plans dataset (Claude Pro/Max, ChatGPT, Gemini), US-only, separate from ModelEntry; scope open) — 2026-07-22.
- **T32 CREATED** (📋, Block F §F3 — surface pricing across artifacts: drawer/compare/column, per-model pages, CSV/NDJSON, stats/coverage, api.md + SDK docs; deps T31) — 2026-07-22.
- **T31 CREATED** (📋, Block F §F2 — pipeline pricing enrichment: LiteLLM adapter maps cost/price → pricing (per-token USD, provenance), overrides pin; deps T30) — 2026-07-22.
- **T30 CREATED** (📋, Block F §F1 — pricing field + schema, STRATEGY §I reversal: optional pricing{inputPer1M,outputPer1M,USD,source,lastVerified,indicative}, additive, version 1) — 2026-07-22.
- **T29 SHIPPED** (Block E §E2 — coverage & gaps transparency: emit.mjs writes coverage.json (per-vendor + overall per-field {filled,rate} via a shared COVERAGE_FIELDS predicate list, byVendor ranked by model count); advertised in endpoints.json/api.md/page; browsable page gained a Coverage & gaps heatmap section (vendor×field, brand-intensity cells, gap cells deep-link to the T28 propose form prefilled per vendor), hidden if coverage.json absent. **Block E now shipped in full — backlog clear.**) — 2026-07-22.
- **T28 SHIPPED** (Block E §E1 — "propose a model" contribution flow: GitHub issue-form `propose-model.yml` (vendor/id/kind/context/sources + no-pricing gate) + `config.yml` contact links; root `CONTRIBUTING.md` mapping proposal → overrides.json → regen --apply → PR; site Contribute section + nav/footer links + per-model ✎ Correct drawer deep-link prefilling the form. **Block E now shipped — begins in CHANGELOG.**) — 2026-07-22.
- **T27 SHIPPED** (Block D §D6 — embeddable status badge: emit.mjs writes badge.json in shields.io endpoint shape {schemaVersion,label,message:"N models · M vendors",color:ea580c,cacheSeconds} from stats totals; advertised endpoints.json badge + api.md + page "Embed a live badge" card w/ preview + Markdown snippet. **Block D now shipped in full.**) — 2026-07-22.
- **T26 SHIPPED** (Block D §D5 — GEO/citability: emit.mjs writes llms.txt (llmstxt.org index: data + vendors + all models) + per-vendor (models/<v>/index.md+html) and per-model (models/<v>/<slug>.md+html) pages — prose summary + facts table; ids slugged (`:`/`/`→`-`), memoized+unique per vendor; models/ tree rewritten each run; advertised endpoints.json llms/pages + api.md + page; 194 model + 14 vendor pages) — 2026-07-22.
- **T25 SHIPPED** (Block D §D4 — extended faceting + alias resolution: emit.mjs writes by-capability/<cap>.json + by-modality/<m>.json slices (modality = input∪output union) mirroring by-kind/by-vendor, present sets derived from flat entries, dirs rewritten each run; + aliases.json alias→{vendor,id} map (sorted, count, collision warn/keep-first, empty until entries carry aliases); advertised in endpoints.json byCapability/byModality/aliases + api.md + page) — 2026-07-22.
- **T23 SHIPPED** (Block D §D2 — alternate exports: emit.mjs writes catalog.csv (flat, fixed 17-col set, `;`-joined arrays, RFC-4180 quoting, CRLF) + catalog.ndjson (one flattened entry per line) from the same ordered flat entries; advertised in endpoints.json csv/ndjson + api.md + page) — 2026-07-22.
- **T22 SHIPPED** (Block D §D1 — catalog change feed: emit.mjs diffs the freshly built catalog against the previously published one → changes.json (added/removed/lifecycle-changed + counts + baseline flag) + Atom feed.xml; baseline = prior on-disk build → live fetch (8s timeout, CATALOG_EMIT_NO_FETCH override) → none; deterministic timestamps from lastUpdated; advertised in endpoints.json/api.md/page) — 2026-07-22.
- **T21 SHIPPED** (Block C §C6 — insights dashboard: 6 inline-SVG bar charts (per vendor/kind/capability/input-modality + context-window histogram + field coverage %) fed by stats.json, context histogram bucketed client-side; theme-aware fills via inline style, section hidden if stats.json absent, nav Insights link) — 2026-07-22.
- **T24 SHIPPED** (Block D §D3 — stats.json aggregate metrics emitted by emit.mjs: totals + byVendor/byKind/byCapability/byInput/byOutputModality ranked count maps + per-field coverage {filled,rate}; advertised in endpoints.json/api.md/page table; unblocks T21) — 2026-07-22.
- **T20 SHIPPED** (Block C §C5 — capability + input/output-modality filter chips derived from the catalog (AND semantics) + click/keyboard sortable columns within each vendor group (id/kind, Details cycles context/output); filters+sort serialized into the T16 hash cap/in/out/sort) — 2026-07-22.
- **T19 SHIPPED** (Block C §C4 — command palette ⌘K/Ctrl-K: subsequence-fuzzy quick-switcher over models/vendors/kinds from a one-pass index, ↑↓/↵/esc + click, nav ⌘K button; picks reuse existing state — model→permalink/drawer, kind→filter, vendor→scroll) — 2026-07-22.
- **T18 SHIPPED** (Block C §C3 — comparison view: pin 2–4 via row ⇄ / drawer action into a bottom tray, side-by-side attributes×models modal, shareable `#compare=v/id,v/id` deep link through the T16 router, per-column remove + Esc/backdrop close) — 2026-07-22.
- **T17 SHIPPED** (Block C §C2 — model detail drawer: click row / permalink opens right-side panel with full record + input/output modalities + conditional status/cutoff/release/aliases, provenance foregrounded, copy-id + copy-as-JSON; wired through the T16 hash router, ✕/Esc/backdrop close) — 2026-07-22.
- **T16 SHIPPED** (Block C §C1 — URL-addressable explorer state: hash sync of search+kind via replaceState + citable model permalinks `#vendor/id` with hover-copy, hashchange router, scroll+flash on deep link) — 2026-07-22.
- **T29 CREATED** (💭, Block E §E2 — coverage & gaps transparency: coverage.json + site section; deps T24) — 2026-07-22.
- **T28 CREATED** (📋, Block E §E1 — "propose a model" flow: GH issue-form + CONTRIBUTING + prefilled deep link) — 2026-07-22.
- **T27 CREATED** (💭, Block D §D6 — embeddable shields.io badge.json; deps T24) — 2026-07-22.
- **T26 CREATED** (📋, Block D §D5 — GEO/citability: llms.txt + per-vendor/per-model static pages; deps T24) — 2026-07-22.
- **T25 CREATED** (📋, Block D §D4 — extended faceting by-capability/by-modality + aliases.json map) — 2026-07-22.
- **T24 CREATED** (📋, Block D §D3 — stats.json aggregate metrics; unblocks T21/T27/T29) — 2026-07-22.
- **T23 CREATED** (💭, Block D §D2 — alternate exports catalog.csv + catalog.ndjson) — 2026-07-22.
- **T22 CREATED** (📋, Block D §D1 — catalog change feed: changes.json + Atom feed.xml, diff-at-emit) — 2026-07-22.
- **T21 CREATED** (📋, Block C §C6 — insights dashboard, inline-SVG charts fed by stats.json; deps T24) — 2026-07-22.
- **T20 CREATED** (📋, Block C §C5 — capability/modality filters + sortable columns) — 2026-07-22.
- **T19 CREATED** (💭, Block C §C4 — command palette ⌘K quick-jump; deps T16) — 2026-07-22.
- **T18 CREATED** (📋, Block C §C3 — model comparison view 2–4 side-by-side; deps T17) — 2026-07-22.
- **T17 CREATED** (📋, Block C §C2 — model detail drawer: full record + provenance + copy-as-JSON) — 2026-07-22.
- **T16 CREATED** (📋, Block C §C1 — URL-addressable state + model permalinks) — 2026-07-22.
- **T15 SHIPPED** (Block A — renamed slug plural→singular everywhere `models-catalog`→`model-catalog`: git-mv'd data/schema files, Python `model_catalog_client/` + Java `modelcatalog/` package dirs; npm/PyPI/Maven package ids + endpoint URL; Turing consumer `turing.models-catalog.url` still to be repointed; no tags published; all tests green) — 2026-07-21.
- **T14 SHIPPED** (Block A — new frontier vendor rows DeepSeek/xAI/MiniMax/Z.ai(GLM): mapped the four native litellm_providers + seeded curated overrides ids, 11 CHAT models enriched by LiteLLM; fixed the stale overrides.json anchoring comment; 14 vendors / 194 models) — 2026-07-21.
- **T13 SHIPPED** (Block B — manual publish workflows: three input-free `workflow_dispatch` publishers `publish-{java,js,python}-client.yml`, each auto-incrementing the manifest patch + committing/tagging the bump, test-gated, then publishing to the public registry — npm / PyPI / Maven Central (Central Portal, GPG-signed `release` profile); token-secret auth; jitpack.yml kept as a Java fallback) — 2026-07-21.
- **T12 SHIPPED** (Block B — auth-free GitHub distribution: root `jitpack.yml` for the Java client via JitPack + `release-js-client.yml` attaching the JS `.tgz` to `js-v*` releases; per-ecosystem no-auth install docs + site Client SDKs section) — 2026-07-21.
- **T6 DROPPED** (Block A — branded custom domain: won't do; the endpoint stays on the public `openviglet.github.io` URL so it reads as a community resource, not a brand asset. §III removed from IMPROVEMENTS. T6 not reused.) — 2026-07-21.
- **T11 SHIPPED** (Block B — Java client: no-runtime-dep Maven `io.github.openviglet:model-catalog-client`, JDK HttpClient + hand-rolled zero-dep JSON reader, records + Kind enum + `.extra()`, Builder, 11 JUnit units) — 2026-07-21.
- **T10 SHIPPED** (Block B — Python client: stdlib-only `urllib` pip pkg `openviglet-model-catalog-client`, typed dataclass + `.extra`, shared surface, 10 unittest units) — 2026-07-21.
- **T9 SHIPPED** (Block B — JS/TS client: zero-dep npm `@openviglet/model-catalog-client`, shared surface + faceted-slice loaders, ESM + hand-written .d.ts, 10 node:test units) — 2026-07-21.
- **T4 SHIPPED** (Block A — extended sources: ollama-api/bedrock-api/huggingface-api adapters behind SourceAdapter, opt-in + partial anchoring, hand-rolled SigV4, 3 normalize tests) — 2026-07-21.
- **T11 CREATED** (💭, Block B §VI — Java client library: JDK HttpClient + records + filter API) — 2026-07-21.
- **T10 CREATED** (💭, Block B §VI — Python client library: stdlib urllib + dataclass models) — 2026-07-21.
- **T9 CREATED** (💭, Block B §VI — JavaScript/TypeScript client library: zero-dep npm, typed models + byKind/byVendor) — 2026-07-21.
- **T7 SHIPPED** (Block A — compact index.json endpoint: same envelope, entries trimmed to vendor/id/label/kind, ~72% smaller) — 2026-07-21.
- **T8 SHIPPED** (Block A — faceted by-kind/by-vendor static slices + endpoints.json discovery manifest, emitted from emit.mjs) — 2026-07-21.
- **T8 CREATED** (📋, Block A §V — faceted static slices by-kind/by-vendor + endpoints.json discovery manifest; deps T7) — 2026-07-21.
- **T7 CREATED** (📋, Block A §IV — compact index.json endpoint: id/label/kind/vendor only) — 2026-07-21.
- **T5 SHIPPED** (Block A — regen.yml manual-dispatch workflow: pipeline with secret API keys → apply on throwaway branch → open PR with diff report; never writes main, never auto-merges) — 2026-07-21.
- **T6 CREATED** (💭, Block A §III — branded custom domain for the endpoint) — 2026-07-21.
- **T5 CREATED** (💭, Block A §II — opt-in CI regeneration that opens a PR, never auto-merges) — 2026-07-21.
- **T4 CREATED** (💭, Block A §I — extended self-hosted/aggregator sources Ollama/Bedrock/HuggingFace behind SourceAdapter) — 2026-07-21.
- **T3 SHIPPED** (Block A — repo extraction: standalone openviglet/model-catalog, Pages publish workflow, reference docs, roadmap set + roadmap-docs skill, README/agents/CLAUDE/LICENSE; Turing switched to remote-only consumption) — 2026-07-21.
- **T2 SHIPPED** (Block A — multi-source regeneration pipeline: SourceAdapter + offline cache + merge/reconciliation + validation/diff review gate + npm run regen + 10 node:test; orig. Turing BD T764-T770) — 2026-07-21.
- **T1 SHIPPED** (Block A — canonical catalog + JSON Schema + emit + public CORS-open JSON API; orig. Turing BC T759-T763) — 2026-07-21.
