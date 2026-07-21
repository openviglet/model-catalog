# @openviglet/models-catalog-client

Zero-dependency, read-only JavaScript / TypeScript client for the
[open model catalog](https://openviglet.github.io/models-catalog) — a free,
community-maintained, vendor-neutral list of AI models (LLMs, embeddings, rerankers
and multimodal), with each model's kind, context window, capabilities and more.

The catalog is just JSON over HTTPS, so you *can* `fetch` it directly. This client
removes the boilerplate: URL selection (rolling vs pinned `catalog-vN.json`, or the
compact `index.json`), flattening the `vendors` map into entries that carry their
`vendor`, `byKind`/`byVendor`/`get` filtering, and in-memory caching with an optional
TTL. It carries **no pricing** — identity, kind and capability only.

The catalog is open and grows with the community — [contributions welcome](https://github.com/openviglet/models-catalog).

- **Zero dependencies.** Plain ESM + a hand-written `.d.ts`; nothing to transpile.
- **Browser + Node (≥ 18).** Uses the global `fetch`; inject your own for older Node or tests.
- **Additive-schema safe.** Unknown `ModelEntry` fields pass through untouched.

## Install

The repo is **public**, so nothing below needs authentication.

Once published to npm:

```bash
npm install @openviglet/models-catalog-client
```

Straight from the public GitHub repo — the client is just two zero-dependency files
(`index.js` + `index.d.ts`), so the auth-free options are:

```bash
# from a tagged release tarball (no login, anyone can)
npm install "https://github.com/openviglet/models-catalog/releases/download/js-v1.0.0/openviglet-models-catalog-client-1.0.0.tgz"
```

…or simply copy `clients/js/index.js` + `index.d.ts` into your project and import
them — there are no dependencies to resolve.

> `npm install git+https://…` can't target a subdirectory of a monorepo, so it won't
> pick up this package from the repo root. GitHub Packages *does* host npm, but
> installing even a **public** package from it still requires an auth token in
> `.npmrc` — so it isn't truly public. The tarball (or vendoring the two files) is the
> genuinely unauthenticated path.

## Usage

```js
import { ModelCatalogClient } from "@openviglet/models-catalog-client";

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
| `endpoints()` | The `endpoints.json` discovery manifest. |

`byKind`/`byVendor` filter the cached full catalog; `fetchByKind`/`fetchByVendor`
download a pre-filtered slice instead, for consumers that only ever need one facet.

## Test

```bash
node --test
```

## License

Apache-2.0. An open, community project — [openviglet/models-catalog](https://github.com/openviglet/models-catalog).
