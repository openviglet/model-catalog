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
- 📋 **T8** (deps: T7) **Faceted static slices + discovery manifest** — emit pre-filtered `by-kind/<KIND>.json` and `by-vendor/<vendor>.json` slices plus an `endpoints.json` manifest listing every published static path, so consumers fetch a pre-filtered view without a runtime. Document the surface in `docs/references/api.md`. → §V

## Block B — Client libraries / SDKs

> Thin, read-only client libraries that wrap the published endpoint (fetch +
> typed models + `by kind`/`by vendor` filters + caching) so consumers don't
> hand-roll HTTP against the JSON. Each mirrors the repo ethos — zero (or minimal
> stdlib-only) runtime dependencies — and consumes the public artifacts; none
> touch the pipeline or the canonical file.

- 💭 **T9** (deps: —) **JavaScript / TypeScript client library** — a zero-dep npm package (browser + Node `fetch`) exposing typed `ModelEntry`/`Kind` models, a small client that loads `catalog.json`/`index.json` (and faceted slices when available), and `byKind`/`byVendor` helpers with in-memory caching. → §VI
- 💭 **T10** (deps: —) **Python client library** — a stdlib-only (`urllib`) pip package with typed `dataclass` models and the same load/filter/cache surface, so Python consumers get the catalog without adding `requests`. → §VI
- 💭 **T11** (deps: —) **Java client library** — a minimal JDK-`HttpClient` artifact (records + the same filter API) that generalizes the ad-hoc fetch Turing already does, publishable for other JVM consumers. → §VI

## Non-goals

- **No pricing.** Identity + kind + capability only, never cost/price fields (STRATEGY §I). The LiteLLM adapter strips every `*cost*`/`*price*` key.
- **No runtime dependency on the pipeline.** It is a local maintenance tool; consumers read the published JSON, not the pipeline.
- **No auto-overwrite / no CI auto-merge.** Regeneration is always propose-and-review (`--apply` only); CI may open a PR but never merges it.
- **No envelope-shape break.** `version` stays `1` — new fields are optional and additive.
