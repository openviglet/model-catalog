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

## Block D — API surface expansion (new static artifacts)

> More ways to consume the same canonical file, all emitted deterministically at publish
> time — no server, no query runtime, no new dependency. Design rationale → §D.

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
