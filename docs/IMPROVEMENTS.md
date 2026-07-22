# Model Catalog — Design rationale (IMPROVEMENTS)

> The *what/why* for **unshipped** sections only. No status tables, no shipped
> implementation reports (those live in `git log` + [CHANGELOG.md](CHANGELOG.md)).
> Status lives only in [ROADMAP.md](ROADMAP.md).

> **Guardrails these all respect.** Every task below is inline HTML/CSS/JS or an
> emitted static file — **no build step, no runtime, no npm dependency, no server-side
> query**, no pricing, and no envelope-shape break (`version` stays `1`). New consumer
> artifacts are *derived* from the canonical file at emit time, exactly like today's
> `index.json` / faceted slices, so they can never drift from the source of truth.

## §C — Web experience & discoverability

The page proves the data exists but under-sells it: a three-column table (id · kind ·
details) that can't be linked to, hides the richest fields, and offers only kind
filtering. For a *reference*, shareability and depth are the whole point — you cite a
reference by linking to it. This block makes the page linkable, deep, and pleasant to
explore, without adding a single dependency.

### §C5 — T20 · Capability & modality filters + sortable columns
Kind is one axis; "show me everything with `vision` and image input, sorted by context
window" is the query people actually have. Add capability/modality filter chips (derived
from the data, so they stay in sync) and clickable column sorts. Pure client-side over
the already-loaded catalog — no API change.

### §C6 — T21 · Insights dashboard
An at-a-glance, inline-SVG (zero-dep) panel — models per vendor, context-window
distribution, kind & modality coverage — reading from the emitted `stats.json` (T24) so
the browser does no heavy aggregation. This is the "make it *interesting*" piece: a
reason to visit and share the page beyond a one-off lookup.

## §D — API surface expansion

The canonical file is the single source of truth; the published surface is whatever we
can *derive* from it deterministically at emit time. Everything here is another such
derivation — same guarantee as `index.json` and the faceted slices, no new moving parts.

### §D1 — T22 · Catalog change feed
The defining value of a reference is knowing *what changed*. At emit, diff the freshly
built catalog against the last published `catalog.json` (fetched or from the prior build)
and write `changes.json` (added / removed / lifecycle-changed ids, per run) plus an
Atom/RSS `feed.xml`. Consumers can subscribe; the site (T21 / a "What's new" strip) can
render it. Diff-at-emit keeps it zero-runtime and always consistent with the artifact.

### §D2 — T23 · Alternate export formats
Not every consumer wants nested JSON. `catalog.csv` (one row per model, flat columns)
serves spreadsheets and BI tools; `catalog.ndjson` serves streaming/`jq -c`/data
pipelines and `grep`. Both are trivially emitted from the same flattened entries, no
schema implications. Kept an *idea* pending confirmation of the exact CSV column set.

### §D3 — T24 · `stats.json` aggregate metrics
A tiny emitted artifact of pre-computed counts — models per vendor, per kind, per
capability/modality, field-fill coverage, grand totals. It is the shared data source for
the site dashboard (T21), the badge (T27) and the coverage view (T29), and spares every
consumer from re-aggregating the full catalog. Low effort, unblocks three other tasks.

### §D4 — T25 · Extended faceting + alias resolution
Round out the faceting story: `by-capability/<cap>.json` and `by-modality/<m>.json`
mirror the existing by-kind/by-vendor slices, and `aliases.json` publishes an alias→
canonical map so a consumer resolving `gpt-4o-latest` or a dated snapshot doesn't have to
scan every entry. All static, all listed in `endpoints.json`.

### §D5 — T26 · GEO / citability artifacts
STRATEGY §I's bet is that this becomes the thing assistants and search engines cite. To
be citable it must be *crawlable and quotable*: emit an `llms.txt` index plus per-vendor
and per-model static pages (Markdown + minimal HTML) so each model has a real,
indexable URL with its facts in prose. This is the machine-readable complement to the
human permalinks in T16.

### §D6 — T27 · Embeddable status badge
A `badge.json` in the shields.io endpoint shape (`{schemaVersion,label,message,color}`)
lets any project drop a live "Model Catalog · N models · M vendors" badge into its
README — a low-cost, high-visibility distribution loop. Reads its numbers from
`stats.json` (T24).

## §E — Community & contribution

Adoption isn't just consumption; a reference the community *owns* is one it can correct
and extend. These lower the barrier to contributing and make the data's completeness
honest and visible.

### §E1 — T28 · "Propose a model" contribution flow
Right now contributing means knowing about `overrides.json` and the propose-and-review
pipeline. Add a GitHub **issue-form** template (structured fields: vendor, id, kind,
context window, sources) + a `CONTRIBUTING.md` that maps a proposal to the
`overrides.json` → `regen --apply` → PR path, and a site "Propose / correct a model"
button that deep-links to the prefilled issue. Converts readers into contributors while
keeping the propose-and-review guarantee intact (no auto-write).

### §E2 — T29 · Coverage & gaps transparency
Trust grows when gaps are visible, not hidden. Emit a `coverage.json` (per-vendor,
per-field fill rate — e.g. "context window known for 82% of vendor X") and surface it in
a small site section. Every red cell is an explicit, low-friction invitation to
contribute (via T28), turning incompleteness from a weakness into a community to-do list.
