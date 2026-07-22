# @openviglet/model-catalog-client

Zero-dependency, read-only JavaScript / TypeScript client for the
[open model catalog](https://openviglet.github.io/model-catalog) — a free,
community-maintained, vendor-neutral list of AI models (LLMs, embeddings, rerankers
and multimodal), with each model's kind, context window, capabilities and more.

The catalog is just JSON over HTTPS, so you *can* `fetch` it directly. This client
removes the boilerplate: URL selection (rolling vs pinned `catalog-vN.json`, or the
compact `index.json`), flattening the `vendors` map into entries that carry their
`vendor`, `byKind`/`byVendor`/`get` filtering, and in-memory caching with an optional
TTL. Alongside identity, kind and capability, each entry may carry `openWeights` and
`parameters` facts, an optional **indicative US list price** (`pricing`), and **cited**
third-party `benchmarks` (capability index + per-domain scores) and `performance` (speed)
numbers — all typed. Pricing and the cited numbers are **references only, not
authoritative**: verify at the source (the vendor for pricing, the leaderboard for
benchmarks). Unknown/optional fields are tolerated and passed through for additive-schema
safety.

The catalog is open and grows with the community — [contributions welcome](https://github.com/openviglet/model-catalog).

- **Zero dependencies.** Plain ESM + a hand-written `.d.ts`; nothing to transpile.
- **Browser + Node (≥ 18).** Uses the global `fetch`; inject your own for older Node or tests.
- **Additive-schema safe.** Unknown `ModelEntry` fields pass through untouched.

## Install

The repo is **public**, so nothing below needs authentication.

From npm — public, no auth:

```bash
npm install @openviglet/model-catalog-client
```

Or, with no registry at all, simply copy `clients/js/index.js` + `index.d.ts` into
your project and import them — there are no dependencies to resolve.

## Usage

```js
import { ModelCatalogClient } from "@openviglet/model-catalog-client";

const catalog = new ModelCatalogClient();

const everything = await catalog.all();            // flattened ModelEntry[]
const embeddings = await catalog.byKind("EMBEDDING");
const openai = await catalog.byVendor("openai");
const one = await catalog.get("openai", "gpt-4o"); // ModelEntry | null
```

TypeScript users get typed `ModelEntry`, `Kind`, and `CatalogEnvelope` with no extra
`@types` package.

## Options

```js
new ModelCatalogClient({
  baseUrl: "https://models.viglet.org", // default: the public GitHub Pages endpoint
  ttlMs: 60_000,                         // re-fetch after 60s; 0 (default) = cache until refresh()
  pinnedVersion: 1,                      // load catalog-v1.json instead of the rolling catalog.json
  compact: true,                         // load the compact index.json (trimmed entries)
  fetch: myFetch,                        // custom fetch (older Node, tests)
});
```

## API

| Method | Returns |
|---|---|
| `load()` | Ensure loaded (fetches only when empty/stale); the raw envelope. |
| `refresh()` | Force a fresh fetch, replacing the cache. |
| `clear()` | Drop the cache; next access re-fetches. |
| `all()` | `ModelEntry[]` across every vendor. |
| `byKind(kind)` | Entries of a kind (case-insensitive). |
| `byVendor(vendor)` | Entries of a vendor (case-insensitive). |
| `get(vendor, id)` | A single `ModelEntry`, or `null`. |
| `vendors()` | Distinct vendor keys. |
| `fetchByKind(kind)` | Fetch the `by-kind/<KIND>.json` slice directly (smaller payload). |
| `fetchByVendor(vendor)` | Fetch the `by-vendor/<vendor>.json` slice directly. |
| `fetchByCapability(capability)` | Fetch the `by-capability/<cap>.json` slice directly (e.g. `"reasoning"`). |
| `fetchByModality(modality)` | Fetch the `by-modality/<m>.json` slice directly (input OR output, e.g. `"image"`). |
| `endpoints()` | The `endpoints.json` discovery manifest. |
| `changes()` | The change feed (`changes.json`) — models added / removed / lifecycle-changed at the last publish. |
| `stats()` | Aggregate metrics (`stats.json`) — totals, per-facet counts, field coverage. |
| `coverage()` | Per-vendor field-coverage breakdown (`coverage.json`). |
| `providers()` | The provider pricing-source registry (`providers.json`). |
| `plans()` | The consumer subscription-plans dataset (`plans.json`, indicative US list prices). |
| `aliases()` | The alias resolution map (`aliases.json`) — alias id → `{ vendor, id }`. |

`byKind`/`byVendor` filter the cached full catalog; `fetchByKind`/`fetchByVendor`
download a pre-filtered slice instead, for consumers that only ever need one facet.

## Test

```bash
node --test
```

## License

Apache-2.0. An open, community project — [openviglet/model-catalog](https://github.com/openviglet/model-catalog).
