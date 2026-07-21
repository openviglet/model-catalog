# Model Catalog — Design rationale (IMPROVEMENTS)

> The *what/why* for **unshipped** sections only. No status tables, no shipped
> implementation reports (those live in `git log` + [CHANGELOG.md](CHANGELOG.md)).
> Status lives only in [ROADMAP.md](ROADMAP.md).

## §I Extended self-hosted / aggregator sources (T4)

The shipped pipeline anchors ids from five cloud vendors' live listing APIs plus
LiteLLM enrichment. The non-cloud rows (`ollama`, `bedrock`, `vertex-ai`) currently
have no *authoritative* live source in the pipeline — they survive only via
carry-forward + LiteLLM, which cannot introduce new ids (the anchoring rule). Add
sources behind the existing `SourceAdapter` contract:

- **Ollama** — the public library index + a local `ollama list` for what's actually
  pulled; kind from the model family.
- **Bedrock** — `ListFoundationModels` (AWS SDK / signed request); maps provider +
  modalities onto the taxonomy.
- **HuggingFace** — for local ONNX embedding models, resolve dimensions + metadata
  from the model card / config.

Each is opt-in and key/credential-gated exactly like the cloud adapters (missing
credential → skip, never fail). This closes the anchoring gap for self-hosted rows.

## §III Branded custom domain for the endpoint (T6)

The endpoint currently lives at the GitHub Pages default
(`openviglet.github.io/models-catalog`). A branded domain (e.g. `models.viglet.org`)
is friendlier for external consumers and decouples the public URL from the repo
name. Add a `public/CNAME`, set `CATALOG_SOURCE_URL` at emit time so the envelope's
`$schema`/`source` + the docs point at the branded host, and update Turing's
`turing.models-catalog.url` default. Because the URL is outward-facing and external
consumers may pin it, keep the old Pages URL resolving (redirect) for a deprecation
window.

## §IV Compact index endpoint (T7)

The full `catalog.json` carries every field (context window, modalities, capability
hints, provenance) for every id — more than a model-picker UI needs to render a
grouped dropdown. A slim `index.json` holding only `{ vendor, id, label, kind }` per
entry lets those consumers fetch a much smaller payload and lazy-load the full record
only when a model is selected. It is emitted by `emit.mjs` from the same canonical
file (so it never drifts), is purely additive, and does **not** touch the envelope
schema or `version`. Consumers that want everything keep using `catalog.json`.

## §V Faceted static slices + discovery manifest (T8)

"New REST methods" without a server = **pre-computed static views**. `emit.mjs`
writes `by-kind/<KIND>.json` (e.g. `by-kind/EMBEDDING.json`) and
`by-vendor/<vendor>.json` (e.g. `by-vendor/openai.json`), each a filtered slice of the
canonical catalog, so a consumer fetches exactly the facet it wants — CDN-cached,
zero runtime — instead of downloading the whole catalog and filtering client-side.
An `endpoints.json` manifest enumerates every published path (rolling, pinned, schema,
index, and the available slice keys) so the surface is machine-discoverable rather
than hard-coded. All slices derive deterministically from the canonical file on each
publish; nothing is hand-maintained, and the envelope schema is unchanged. This is the
static-first answer to "more query methods" — a real dynamic query API (arbitrary
filters via serverless) stays out of scope for GitHub Pages (see STRATEGY / non-goals).
