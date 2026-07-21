# Model Catalog

A **vendor-neutral, kind-aware public catalog of LLM / embedding / rerank / media
models** — which model ids exist per vendor and, for each, its *kind* (chat,
embedding, rerank, image, transcription, speech, video, moderation), context
window, max output tokens, embedding dimensions, modalities and capability hints.
Published as a free, unauthenticated, CORS-open, versioned JSON artifact. Part of
**Viglet Turing ES**.

> **Identity + kind, not pricing.** The catalog never carries cost/price — see
> [docs/STRATEGY.md](docs/STRATEGY.md) §I.

## Public API

| URL | Meaning |
|---|---|
| `https://openviglet.github.io/model-catalog/catalog.json` | Rolling latest |
| `https://openviglet.github.io/model-catalog/catalog-v1.json` | Pinned to schema v1 |
| `https://openviglet.github.io/model-catalog/catalog.schema.json` | JSON Schema (Draft 2020-12) |
| `https://openviglet.github.io/model-catalog/` | Browsable reference page |

Full contract → [docs/references/api.md](docs/references/api.md).

```bash
# every embedding model across all vendors
curl -s https://openviglet.github.io/model-catalog/catalog-v1.json \
  | jq '.vendors | to_entries[].value[] | select(.kind=="EMBEDDING") | .id'
```

## Client SDKs

Zero-/minimal-dependency, read-only clients wrap the endpoints above (URL selection,
`vendors`-map flattening, `byKind`/`byVendor`/`get` filters, in-memory caching). All
Apache-2.0, published to their public registries — nothing below needs auth:

| SDK | Install |
|---|---|
| **Java** (JDK `HttpClient`, 17+) | Maven Central — `io.github.openviglet:model-catalog-client` |
| **JS / TS** (ESM, Node 18+ & browser) | npm — `npm i @openviglet/model-catalog-client` |
| **Python** (stdlib `urllib`, 3.8+) | PyPI — `pip install openviglet-model-catalog-client` |

```xml
<dependency>
  <groupId>io.github.openviglet</groupId>
  <artifactId>model-catalog-client</artifactId>
  <version>1.0.2</version>
</dependency>
```

Per-SDK docs: [Java](clients/java/README.md) · [JS/TS](clients/js/README.md) · [Python](clients/python/README.md).

## Layout

```
catalog/     canonical model-catalog.json + JSON Schema  (single source of truth)
pipeline/    zero-dep multi-source regeneration pipeline  (propose-and-review)
scripts/     emit.mjs — builds the public artifacts from the canonical file
public/      index.html (browsable page); models/* is emitted (gitignored)
docs/        references (api, pipeline) + roadmap set (ROADMAP/CHANGELOG/…)
```

## Maintaining the catalog

The canonical file is **hand-editable** for a quick fix, or regenerated from
multiple trustworthy sources per vendor (live vendor APIs + the LiteLLM registry +
curated `overrides.json`) via the propose-and-review pipeline:

```bash
npm run regen              # dry-run: fetch → merge → validate → write report (canonical untouched)
npm run regen -- --apply   # write the canonical file (the only path that overwrites it)
npm run emit               # rebuild the public artifacts from the canonical file
npm test                   # pipeline unit tests
```

A missing API key skips that source; nothing hard-fails. The canonical file is only
ever overwritten on `--apply`. Full workflow → [docs/references/pipeline.md](docs/references/pipeline.md).

## Publishing

`.github/workflows/publish.yml` emits the artifacts and deploys `public/` to GitHub
Pages on every push to `main` that touches the catalog. It **never** regenerates
from upstream — publishing only serves the already-reviewed canonical file.

## Zero dependencies

The pipeline, emit step and browsable page use only Node built-ins + global `fetch`
and inline HTML/CSS/JS. There is nothing to `npm install`. Requires Node ≥ 20.

## License

[Apache-2.0](LICENSE).
