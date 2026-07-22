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

## Block C — Web experience & discoverability (the browsable page)

> Turn `public/index.html` from a read-only table into a tool developers reach for and
> link to. Every item is inline, zero-dep, static-hosting-safe (no build step, no runtime).
> Design rationale → [IMPROVEMENTS.md](IMPROVEMENTS.md) §C.

- **T18** 📋 **Model comparison view** — select 2–4 models and see them side-by-side (context/output windows, modalities, capabilities, lifecycle) to answer "gpt-4o vs claude vs gemini" without leaving the page. deps: T17 → §C3
- **T19** 💭 **Command palette (⌘K / Ctrl-K)** — fuzzy quick-jump to any model, vendor or kind; keyboard-first navigation the developer audience expects. deps: T16 → §C4
- **T20** 📋 **Capability & modality filters + sortable columns** — filter beyond kind (`vision`/`tools`/`reasoning`, input/output modality) and sort by context window / output / release date. deps: — → §C5
- **T21** 📋 **Insights dashboard** — a small, dependency-free charts section (inline SVG): models per vendor, context-window distribution, kind & modality coverage — fed by `stats.json`. Makes the catalog *interesting* to explore, not just queryable. deps: T24 → §C6

## Block D — API surface expansion (new static artifacts)

> More ways to consume the same canonical file, all emitted deterministically at publish
> time — no server, no query runtime, no new dependency. Design rationale → §D.

- **T22** 📋 **Catalog change feed** — at emit, diff the new catalog against the previously published one and write `changes.json` + an Atom/RSS `feed.xml` of adds / removals / lifecycle transitions. A reference's killer feature is "what changed" — subscribable, and the raw material for a site "What's new" strip. deps: — → §D1
- **T23** 💭 **Alternate export formats** — emit `catalog.csv` and `catalog.ndjson` from the canonical file for spreadsheet / data-pipeline / `grep`-friendly consumers who don't want to walk nested JSON. deps: — → §D2
- **T24** 📋 **`stats.json` aggregate metrics** — a small emitted artifact with counts (models per vendor, per kind, per capability/modality; field-fill coverage; totals) so the site dashboard and external consumers read one number instead of recomputing over the full catalog. deps: — → §D3
- **T25** 📋 **Extended faceting + alias resolution** — `by-capability/<cap>.json` and `by-modality/<m>.json` slices alongside the existing by-kind/by-vendor, plus an `aliases.json` map (alias id → canonical id) so consumers can resolve `-latest`/dated snapshots without walking every entry. deps: — → §D4
- **T26** 📋 **GEO / citability artifacts** — emit an `llms.txt` index and per-vendor / per-model static Markdown+HTML pages so search engines and assistants can index and *cite* the catalog. Directly serves the discoverability thesis (STRATEGY §I: be the thing tools cite for "what embedding models does OpenAI have?"). deps: T24 → §D5
- **T27** 💭 **Embeddable status badge** — a shields.io-endpoint-compatible `badge.json` (`{schemaVersion,label,message}`) so any README can show a live "Model Catalog · 194 models · 14 vendors" badge; cheap, high-visibility adoption driver. deps: T24 → §D6

## Block E — Community & contribution

> Lower the barrier for the community to *contribute* and to trust the data's completeness.
> Design rationale → §E.

- **T28** 📋 **"Propose a model" contribution flow** — a GitHub issue-form template for proposing/correcting a model, a `CONTRIBUTING.md` explaining the `overrides.json` + propose-and-review path, and a site button that deep-links to the prefilled issue. Turns passive readers into contributors. deps: — → §E1
- **T29** 💭 **Coverage & gaps transparency** — a `coverage.json` (per-vendor/per-field fill rate) and a site section that surfaces what's incomplete, so gaps are visible and become an open invitation to contribute rather than a hidden weakness. deps: T24 → §E2

> The endpoint intentionally stays on its public GitHub Pages URL
> (`openviglet.github.io/model-catalog`) — an unbranded, community-owned home signals
> it is a public resource, not a brand asset.

## Non-goals

- **No pricing.** Identity + kind + capability only, never cost/price fields (STRATEGY §I). The LiteLLM adapter strips every `*cost*`/`*price*` key.
- **No runtime dependency on the pipeline.** It is a local maintenance tool; consumers read the published JSON, not the pipeline.
- **No auto-overwrite / no CI auto-merge.** Regeneration is always propose-and-review (`--apply` only); CI may open a PR but never merges it.
- **No envelope-shape break.** `version` stays `1` — new fields are optional and additive.
