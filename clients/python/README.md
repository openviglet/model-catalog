# openviglet-model-catalog-client (Python)

Zero-dependency, read-only Python client for the
[open model catalog](https://openviglet.github.io/model-catalog) — a free,
community-maintained, vendor-neutral list of AI models (LLMs, embeddings, rerankers
and multimodal), with each model's kind, context window, capabilities and more.

The catalog is just JSON over HTTPS, so you *can* fetch it directly. This client
removes the boilerplate: URL selection (rolling vs pinned `catalog-vN.json`, or the
compact `index.json`), flattening the `vendors` map into typed entries that carry
their `vendor`, `by_kind`/`by_vendor`/`get` filtering, and in-memory caching with an
optional TTL. Alongside identity, kind and capability, each entry may carry
`open_weights` and `parameters` facts, an optional **indicative US list price**
(`pricing`), and **cited** third-party `benchmarks` (capability index + per-domain
scores) and `performance` (speed) numbers. Pricing and the cited numbers are
**references only, not authoritative**: verify at the source (the vendor for pricing,
the leaderboard for benchmarks). The nested objects (`pricing`/`benchmarks`/`performance`)
are exposed as plain dicts, like `modalities`; unknown fields are preserved on `.extra`.

- **Stdlib only.** Uses `urllib` — no `requests`, nothing to install alongside it.
- **Typed.** `ModelEntry` is a `dataclass`; unknown JSON fields are kept in `.extra`
  so a future additive-schema field never breaks your code.
- **Python ≥ 3.8.**

The catalog is open and grows with the community — [contributions welcome](https://github.com/openviglet/model-catalog).

## Install

The repo is **public**, so every option below is **unauthenticated** — no token, no
login, anyone can install.

Straight from GitHub (works today — `pip` just clones the public repo over HTTPS):

```bash
pip install "git+https://github.com/openviglet/model-catalog.git#subdirectory=clients/python"
```

Pin to a tag or commit for reproducible builds:

```bash
pip install "git+https://github.com/openviglet/model-catalog.git@v1.0.0#subdirectory=clients/python"
```

> GitHub does **not** host a PyPI-style index (GitHub Packages covers npm, Maven,
> NuGet, RubyGems and containers, but not `pip`), so there is no "GitHub as a pip
> registry." The `git+https://` URL above *is* the public, auth-free way to install
> from GitHub.

From PyPI — public, no auth:

```bash
pip install openviglet-model-catalog-client
```

## Usage

```python
from model_catalog_client import ModelCatalogClient

catalog = ModelCatalogClient()

everything = catalog.all()                       # list[ModelEntry]
embeddings = catalog.by_kind("EMBEDDING")
openai = catalog.by_vendor("openai")
one = catalog.get("openai", "gpt-4o")            # ModelEntry | None
print(one.context_window)                         # camelCase JSON -> snake_case attrs
```

## Options

```python
ModelCatalogClient(
    base_url="https://models.viglet.org",  # default: the public GitHub Pages endpoint
    ttl=60,                                  # re-fetch after 60s; 0 (default) = cache until refresh()
    pinned_version=1,                        # load catalog-v1.json instead of the rolling catalog.json
    compact=True,                            # load the compact index.json (trimmed entries)
    timeout=30,                              # per-request socket timeout (seconds)
)
```

## API

| Method | Returns |
|---|---|
| `load()` | Ensure loaded (fetches only when empty/stale); the raw envelope `dict`. |
| `refresh()` | Force a fresh fetch, replacing the cache. |
| `clear()` | Drop the cache; next access re-fetches. |
| `all()` | `list[ModelEntry]` across every vendor. |
| `by_kind(kind)` | Entries of a kind (case-insensitive). |
| `by_vendor(vendor)` | Entries of a vendor (case-insensitive). |
| `get(vendor, id)` | A single `ModelEntry`, or `None`. |
| `vendors()` | Distinct vendor keys. |
| `fetch_by_kind(kind)` | Fetch the `by-kind/<KIND>.json` slice directly (smaller payload). |
| `fetch_by_vendor(vendor)` | Fetch the `by-vendor/<vendor>.json` slice directly. |
| `endpoints()` | The `endpoints.json` discovery manifest. |
| `stats()` | Aggregate metrics (`stats.json`) — totals, per-facet counts, field coverage. |
| `coverage()` | Per-vendor field-coverage breakdown (`coverage.json`). |
| `providers()` | The provider pricing-source registry (`providers.json`). |
| `plans()` | The consumer subscription-plans dataset (`plans.json`, indicative US list prices). |
| `aliases()` | The alias resolution map (`aliases.json`) — alias id → `{vendor, id}`. |

## Test

```bash
python -m unittest discover -s tests
```

## License

Apache-2.0. An open, community project — [openviglet/model-catalog](https://github.com/openviglet/model-catalog).
