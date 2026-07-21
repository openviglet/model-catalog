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

## Block A — Catalog API + regeneration pipeline

> The canonical catalog, schema, multi-source regeneration pipeline, emit step and
> the browsable public API all shipped (see [CHANGELOG.md](CHANGELOG.md) → Block A;
> migrated from Viglet Turing ES). The remaining bets extend source coverage and
> automate the review-gated refresh:

- 💭 **T4** (deps: —) **Extended self-hosted / aggregator sources** — add the Ollama library + local `ollama list`, Bedrock `ListFoundationModels`, and HuggingFace (for local ONNX embedding models) behind the shipped `SourceAdapter` contract, so the non-cloud vendor rows (`ollama`, `bedrock`, `vertex-ai`) stop depending on LiteLLM alone for anchoring. → §I
- 💭 **T6** (deps: —) **Branded custom domain for the endpoint** — front the GitHub Pages endpoint with a custom domain (e.g. `models.viglet.org`) via `CNAME` + `CATALOG_SOURCE_URL`, and update consumers (Turing's `turing.models-catalog.url`) + the docs. → §III

## Non-goals

- **No pricing.** Identity + kind + capability only, never cost/price fields (STRATEGY §I). The LiteLLM adapter strips every `*cost*`/`*price*` key.
- **No runtime dependency on the pipeline.** It is a local maintenance tool; consumers read the published JSON, not the pipeline.
- **No auto-overwrite / no CI auto-merge.** Regeneration is always propose-and-review (`--apply` only); CI may open a PR but never merges it.
- **No envelope-shape break.** `version` stays `1` — new fields are optional and additive.
