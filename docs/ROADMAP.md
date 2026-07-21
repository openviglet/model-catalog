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

_No active backlog. The endpoint intentionally stays on its public GitHub Pages URL
(`openviglet.github.io/model-catalog`) — an unbranded, community-owned home signals
it is a public resource, not a brand asset._

## Non-goals

- **No pricing.** Identity + kind + capability only, never cost/price fields (STRATEGY §I). The LiteLLM adapter strips every `*cost*`/`*price*` key.
- **No runtime dependency on the pipeline.** It is a local maintenance tool; consumers read the published JSON, not the pipeline.
- **No auto-overwrite / no CI auto-merge.** Regeneration is always propose-and-review (`--apply` only); CI may open a PR but never merges it.
- **No envelope-shape break.** `version` stays `1` — new fields are optional and additive.
