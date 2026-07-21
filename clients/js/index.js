/**
 * @openviglet/model-catalog-client — a zero-dependency, read-only client for the
 * open, community-maintained catalog of AI models
 * (https://openviglet.github.io/model-catalog): a vendor-neutral, kind-aware list of
 * LLMs, embeddings, rerankers and multimodal models, free for anyone to use.
 *
 * The catalog is "just JSON over HTTPS"; this client removes the boilerplate every
 * consumer would otherwise re-invent — URL selection (rolling vs pinned
 * `catalog-vN.json`, or the compact `index.json`), flattening the `vendors` map into
 * entries that carry their `vendor`, `byKind`/`byVendor`/`get` filtering, and
 * in-memory caching with an optional TTL. It carries no pricing — identity, kind and
 * capability only.
 *
 * Runs unchanged in the browser and in Node (>= 18) on the global `fetch`; pass a
 * custom `fetch` for older Node or for tests. Unknown ModelEntry fields are tolerated
 * so a future additive-schema field never breaks an old client.
 *
 *   import { ModelCatalogClient } from "@openviglet/model-catalog-client";
 *   const catalog = new ModelCatalogClient();
 *   const embeddings = await catalog.byKind("EMBEDDING");
 */

/** Default public endpoint (GitHub Pages, CORS-open). */
export const DEFAULT_BASE_URL = "https://openviglet.github.io/model-catalog";

/** The `kind` taxonomy, as published in the schema enum. */
export const KINDS = Object.freeze([
  "CHAT",
  "EMBEDDING",
  "RERANK",
  "IMAGE",
  "TRANSCRIPTION",
  "SPEECH",
  "VIDEO",
  "MODERATION",
  "UNKNOWN",
]);

/** Flatten a catalog envelope's `vendors` map into entries that each carry `vendor`. */
function flatten(envelope) {
  const vendors = envelope?.vendors || {};
  const entries = [];
  for (const [vendor, list] of Object.entries(vendors)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      // The published artifact already stamps `vendor`; the raw source keys by it.
      entries.push(entry.vendor ? entry : { ...entry, vendor });
    }
  }
  return entries;
}

export class ModelCatalogClient {
  #baseUrl;
  #ttlMs;
  #fetch;
  #now;
  #pinnedVersion;
  #compact;
  /** @type {{ fetchedAt: number, envelope: object, entries: object[] } | null} */
  #cache = null;

  /**
   * @param {object} [options]
   * @param {string} [options.baseUrl]        Endpoint base (default DEFAULT_BASE_URL).
   * @param {number} [options.ttlMs]          Cache lifetime in ms; 0 = cache until refresh() (default 0).
   * @param {number} [options.pinnedVersion]  Load the pinned `catalog-vN.json` instead of rolling `catalog.json`.
   * @param {boolean} [options.compact]       Load the compact `index.json` (trimmed entries) instead of the full catalog.
   * @param {typeof fetch} [options.fetch]    Custom fetch (default global fetch).
   * @param {() => number} [options.now]      Clock for TTL (default Date.now); injectable for tests.
   */
  constructor(options = {}) {
    const {
      baseUrl = DEFAULT_BASE_URL,
      ttlMs = 0,
      pinnedVersion,
      compact = false,
      fetch: fetchImpl,
      now,
    } = options;
    let base = String(baseUrl);
    while (base.endsWith("/")) base = base.slice(0, -1); // normalize trailing slashes (no ReDoS)
    this.#baseUrl = base;
    this.#ttlMs = Number(ttlMs) || 0;
    this.#pinnedVersion = pinnedVersion;
    this.#compact = Boolean(compact);
    this.#fetch = fetchImpl || (typeof fetch === "function" ? fetch : undefined);
    this.#now = now || Date.now;
    if (typeof this.#fetch !== "function") {
      throw new TypeError(
        "model-catalog: no fetch available — pass options.fetch or run on Node >= 18 / a browser",
      );
    }
  }

  /** Absolute URL for a published path. */
  #url(path) {
    return `${this.#baseUrl}/${path}`;
  }

  async #fetchJson(path) {
    const url = this.#url(path);
    const res = await this.#fetch(url);
    if (!res.ok) throw new Error(`model-catalog: GET ${url} -> HTTP ${res.status}`);
    return res.json();
  }

  #primaryPath() {
    if (this.#compact) return "index.json";
    return this.#pinnedVersion != null ? `catalog-v${this.#pinnedVersion}.json` : "catalog.json";
  }

  #isFresh() {
    if (!this.#cache) return false;
    if (!this.#ttlMs) return true;
    return this.#now() - this.#cache.fetchedAt < this.#ttlMs;
  }

  /** Ensure the catalog is loaded (fetching only when the cache is empty or stale). Returns the raw envelope. */
  async load() {
    if (this.#isFresh()) return this.#cache.envelope;
    return this.refresh();
  }

  /** Force a fresh fetch, replacing the cache. Returns the raw envelope. */
  async refresh() {
    const envelope = await this.#fetchJson(this.#primaryPath());
    this.#cache = { fetchedAt: this.#now(), envelope, entries: flatten(envelope) };
    return envelope;
  }

  /** Drop the in-memory cache; the next access re-fetches. */
  clear() {
    this.#cache = null;
  }

  /** All entries across every vendor (flattened, each carrying `vendor`). */
  async all() {
    await this.load();
    return this.#cache.entries.slice();
  }

  /** Entries of a given kind (case-insensitive), e.g. "EMBEDDING". */
  async byKind(kind) {
    const k = String(kind).toUpperCase();
    await this.load();
    return this.#cache.entries.filter((e) => e.kind === k);
  }

  /** Entries of a given vendor (case-insensitive), e.g. "openai". */
  async byVendor(vendor) {
    const v = String(vendor).toLowerCase();
    await this.load();
    return this.#cache.entries.filter((e) => e.vendor === v);
  }

  /** A single entry by (vendor, id), or null if absent. */
  async get(vendor, id) {
    const v = String(vendor).toLowerCase();
    await this.load();
    return this.#cache.entries.find((e) => e.vendor === v && e.id === id) || null;
  }

  /** The distinct vendor keys present in the catalog. */
  async vendors() {
    await this.load();
    return [...new Set(this.#cache.entries.map((e) => e.vendor))];
  }

  // --- Faceted slices: fetch a smaller pre-filtered payload directly, bypassing the
  //     primary cache. Handy when a consumer only ever needs one facet. ---

  /** Fetch the `by-kind/<KIND>.json` slice directly (smaller payload). Returns flattened entries. */
  async fetchByKind(kind) {
    return flatten(await this.#fetchJson(`by-kind/${String(kind).toUpperCase()}.json`));
  }

  /** Fetch the `by-vendor/<vendor>.json` slice directly (smaller payload). Returns flattened entries. */
  async fetchByVendor(vendor) {
    return flatten(await this.#fetchJson(`by-vendor/${String(vendor).toLowerCase()}.json`));
  }

  /** The discovery manifest (`endpoints.json`) — a map of every published path. */
  async endpoints() {
    return this.#fetchJson("endpoints.json");
  }
}

export default ModelCatalogClient;
