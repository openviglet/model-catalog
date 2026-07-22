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

## §G — Static-site expansion & citability

The catalog's **cite/reference** job is served by static, crawlable, JS-free pages emitted
from the canonical JSON — the durable counterpart to the interactive Explore SPA (§L). The
scalable path is to **extend the zero-dep `emit.mjs` generator**, not adopt a framework:
Next.js was weighed and rejected because it would break the foundational zero-dependency
bet to solve a problem the emit path already solves (generating static files from a JSON is
a loop, not a framework need). The seam with §L is deliberate and load-bearing: the SPA owns
*interactivity* (filter / sort / compare over the live dataset); these pages own *citability*
(one model, one segment — linkable, indexable, provenance-first). The drawer is the bridge —
a preview that always links out to the durable per-model page.

### §G1 — T34 · Per-segment hubs + sitemap
Reframed from "more landing pages" into real **per-segment hubs**: per-capability /
per-modality / per-kind (and per-tier) pages that are each a compact **static leaderboard**
(the top models in that segment, pre-sorted, cross-linked to per-model pages) + a short prose
intro + links to the matching JSON slice and to Explore pre-filtered to that segment — *not*
a bare link list. Plus `sitemap.xml` + `robots.txt` so every hub and per-model page is
crawlable. Serves humans and assistants/crawlers at once; derived-at-emit, zero-dep, no
framework. (This is the "reference/cite" backbone of the §L information architecture, no
longer an SEO side-quest.)

### §G2 — T58 · First-class per-model page
Today a model's depth lives only in the transient SPA drawer and a minimal, differently-styled
emitted table — there is no durable, well-laid-out, citable page, which is the thing a reference
site most needs. Promote the emitted page to a first-class, scannable reference: a header
(vendor / kind / use-case tags / tier / open-weights), an **at-a-glance stat strip** (context,
max output, price, one headline benchmark, throughput — only tiles that carry data),
populated-only sections (pricing / benchmarks incl. per-domain scores / performance / identity /
capabilities, each with its cited caveat + `source` + `lastVerified`), an **always-visible
provenance block** (the trust anchor on a citable page), and derived **related models** (same
vendor + kind neighbours, tier above/below — a loop at emit, zero-dep). Style it with the SPA's
design **tokens** so hub → page → drawer read as one system (today the static page is a jarring
separate mini-stylesheet). Sparse-aware by *omitting* empty sections (a low-data model looks
intentional, not broken) — unlike the drawer/compare, which show "—" for alignment. The drawer
stays as the in-context preview and gains an "Open full page ↗" link. Evolves T26.

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

### §K4 — T49 · Shared use-case-tag + price-tier classifier
The browsable page derives at-a-glance *use-case tags* (from kind/capabilities/modalities) and a
price-bucketed *tier* client-side via `classify()` (T38). That logic is useful to any consumer,
not just the page. Port it into each SDK as an optional derived helper so consumers get the same
categorization without re-implementing it. Purely derived from fields already present — no
schema or contract change — hence exploratory (💭): the open question is keeping one classifier
definition in step across four implementations (page + three SDKs). Depends on T46 so the tier
logic can read a typed `pricing`.

## §L — Explore & decide: catalog data experience

The catalog outgrew its container. Rich per-model data (pricing, cited benchmarks + per-domain
scores, cited speed, open-weights/parameters, classification) across ~240 models now sits behind
a Browse surface that still presents a **vendor-grouped inventory** — and sorting happens *within*
each vendor group, so the cross-vendor questions the catalog is uniquely able to answer ("cheapest
chat model overall", "biggest context window", "best intelligence-per-dollar") are literally
impossible in the UI. Meanwhile the home page is accreting analytics bands (Insights, Coverage,
Plans, Sources) above Browse — the "hyper-page with everything" to avoid. This block turns the site
from an **inventory** into a **decision tool**, organised around three jobs — **orient** (what/why
+ how to consume), **explore/decide** (find & compare across the whole dataset), **cite** (durable
per-model / per-segment pages, §G) — each with its own surface so no single screen carries
everything.

**Foundational principle — the site is the reference consumer of the JS SDK.** The page must stop
hand-rolling `fetch("./catalog.json")` and instead consume `@openviglet/model-catalog-client` (the
Block B/K SDK), loaded as a static ESM module (no build, no CDN, still zero-dep). This makes the
site the real-world acceptance test for the SDK: any gap the Explore rework hits — a missing loader,
an untyped field, an unexposed slice — is fixed **in the SDK** (feeding Block K: T47 aggregate
loaders, T48 faceted-slice / change-feed accessors), never worked around in the page.

**Honesty under sparsity is a design constraint, not an afterthought.** Benchmarks are populated on
~14% of models, performance ~8%, pricing ~86%; three advertised fields (`knowledgeCutoff`,
`releaseDate`, `status`), `benchmarks.arenaElo` and the `reasoning` score domain are 0% filled.
Dense facts drive the defaults; sparse facts are opt-in overlays that always print their denominator
("32 of 182 chat models with a cited score") and never null-fill, plot, or invent — consistent with
the provenance-first bet. All views keep the existing framing: tier is a *price proxy, not a quality
verdict*; every benchmark/speed number is *cited — verify at the source*.

### §L1 — T50 · SDK-backed page (dogfood the JS client)
Migrate `public/index.html` from raw `fetch` to `@openviglet/model-catalog-client` as ESM (emit
copies `clients/js/*.mjs` into `public/sdk/`; the page `import`s it via `<script type="module">`).
Foundational for the rest of the block and the validation loop the SDK needs — gaps surfaced here
are filed against Block K. Zero-dep (self-hosted ESM, no build/CDN); no user-facing behaviour change.

### §L2 — T51 · Global flat sort + optional group-by
Rework the Browse render from "sort within each vendor card" to a **flat pass over all models,
sorted once globally**, with vendor becoming one optional *group-by* (None default / Vendor / Kind /
Tier). The single highest-leverage fix: cross-vendor ranking becomes possible. Reuses the existing
sort/filter/drawer/pin machinery; the URL hash already carries sort state.

### §L3 — T52 · Decision columns + column chooser
Promote the comparable attributes out of the crammed "Details" chip-cell into aligned, sortable
columns (context, price, headline benchmark, speed, tags) with a column chooser (lean default,
choice persisted in the URL). The *table* holds decision columns; the per-model *page* (§G2) holds
everything. Kind-aware defaults (CHAT → price/intelligence/context; EMBEDDING → dims) so a
chat-shaped lens isn't forced on all 8 kinds.

### §L4 — T53 · Honest sparsity + data hygiene
Make missing data a first-class, honest dimension: "has price / has benchmark / has speed" quick
filters; every ranked or plotted view prints its denominator (reusing `stats.coverage` rates so it
can't drift); empty cells render as a dimmed dash with a "not recorded yet — contribute" tooltip
wired to the T28 prefilled issue; a low-population view shows a contribute empty-state, not a
near-blank chart. The same pass clears the 0%-filled noise — stop advertising always-empty fields
(drop the empty CSV columns / hide all-zero coverage columns / remove `reasoning` + `arenaElo`
scaffolding until data exists; add the missing `COV_LABEL` entries) — because empty columns erode
the very trust the coverage view exists to build.

### §L5 — T54 · Decision views: frontier + leaderboards
The flagship "which model" visuals, scoped honestly to the population that supports them: a
hand-rolled inline-SVG **price × intelligence** scatter (log price axis, Pareto front highlighted,
dot → drawer) over the ~32 chat models that carry both, plus precomputed **`leaderboards.json`**
(emit-time, beside `stats.json`) — cheapest per kind, best intelligence-per-dollar, biggest context,
fastest — each list carrying `{ metric, kind, population, total }` so the denominator ships with the
data. Precomputed because they are *answers* a consumer (or a citing assistant) wants in one fetch,
and derived-at-emit so they can't drift. Exploratory (💭): the exact chart/interaction design and
which leaderboards ship first want a design pass.

### §L6 — T55 · IA re-layout (orient / explore / cite)
Stop the hyper-page slide: home becomes **orient only** (hero + a tight "what's inside" strip + a
prominent Explore entry + API / SDKs / Contribute); the analytics bands (Insights charts, Coverage
heatmap, Plans, Sources) move **off the critical path** into one addressable, tabbed analytics home
(Overview · Coverage · Plans · Sources), trimming the nav from eight bands toward four. Browse/Explore
stays the single primary interactive surface. Pure information architecture — no new data.

### §L7 — T56 · Facet rail + shareable presets
Replace the tall stacked facet wall with a grouped, collapsible **facet rail** carrying per-chip
match counts, an "N active · clear all" summary, and labelled AND/OR semantics — so filtering has
real scent and dead-end empty states get rarer. Add a **"copy link to this view"** action over the
existing URL-state and ship a handful of curated **preset** links (e.g. "Frontier reasoning",
"Open-weight ≥ 70B", "Cheapest long-context chat", "Embeddings by dimension"). Exploratory (💭):
preset curation + rail layout want a design pass. Depends on the flat table (T51) + columns (T52).

### §L8 — T57 · Mobile & render performance
Restore usable **mobile navigation** (today every nav link is hidden < 720px, leaving only ⌘K +
theme) via a compact menu, add a **card view** < 720px (an 8-column horizontally-scrolling table is
hostile on a phone), and **debounce the keystroke re-render** (Browse currently rebuilds the whole
table DOM on every keypress — fine at 240 models, laggy well before it breaks). Exploratory (💭):
the mobile IA + card layout want a design pass.
