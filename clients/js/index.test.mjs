/**
 * Unit tests for @openviglet/model-catalog-client (node:test, zero-dep).
 * A fake fetch serves a tiny in-memory catalog so the tests are fully offline and
 * deterministic; an injected clock drives the TTL assertions without sleeping.
 *
 *   node --test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BASE_URL, KINDS, ModelCatalogClient } from "./index.js";

const BASE = "https://example.test/models";

const CATALOG = {
  version: 1,
  lastUpdated: "2026-07-21",
  source: BASE,
  vendors: {
    openai: [
      // Illustrative values — exercises pass-through of the Block F/I additive fields.
      {
        id: "gpt-4o",
        label: "GPT-4o",
        kind: "CHAT",
        openWeights: false,
        parameters: 200000000000,
        pricing: { inputPer1M: 2.5, outputPer1M: 10, currency: "USD", unit: "per_1M_tokens", indicative: true, source: "litellm", lastVerified: "2026-07-20" },
        benchmarks: { intelligenceIndex: 71, arenaElo: 1342, scores: { coding: { value: 55 }, reasoning: { value: 80 } }, indicative: true, source: "Artificial Analysis", lastVerified: "2026-07-20" },
        performance: { throughputTps: 120, latencyTtftSec: 0.42, indicative: true, source: "Artificial Analysis", lastVerified: "2026-07-20" },
      },
      { id: "text-embedding-3-large", label: "Embedding 3 Large", kind: "EMBEDDING" },
    ],
    // Second vendor omits per-entry `vendor` to prove the client backfills from the key.
    anthropic: [{ id: "claude-opus-4-8", label: "Claude Opus 4.8", kind: "CHAT" }],
  },
};

const BY_KIND_EMBEDDING = {
  version: 1,
  lastUpdated: "2026-07-21",
  source: BASE,
  kind: "EMBEDDING",
  vendors: { openai: [{ id: "text-embedding-3-large", label: "Embedding 3 Large", kind: "EMBEDDING", vendor: "openai" }] },
};

const ENDPOINTS = { version: 1, latest: `${BASE}/catalog.json`, byKind: {}, byVendor: {} };

// Aggregate & registry artifacts (T47) — trimmed to the shape the accessors return.
const STATS = {
  version: 1,
  totals: { models: 3, vendors: 2, kinds: 2, capabilities: 0 },
  byVendor: { openai: 2, anthropic: 1 },
  byKind: { CHAT: 2, EMBEDDING: 1 },
  coverage: { total: 3, fields: { pricing: { filled: 1, rate: 0.3333 } } },
};
const COVERAGE = {
  version: 1,
  fields: ["pricing"],
  overall: { total: 3, fields: { pricing: { filled: 1, rate: 0.3333 } } },
  byVendor: { openai: { total: 2, fields: { pricing: { filled: 1, rate: 0.5 } } } },
};
const PROVIDERS = {
  version: 1,
  providers: [{ id: "openai", name: "OpenAI", category: "model-creator", catalogVendor: "openai" }],
};
const PLANS = {
  version: 1,
  plans: { anthropic: [{ id: "claude-pro", name: "Claude Pro", indicative: true, source: "anthropic.com", lastVerified: "2026-07-20", vendor: "anthropic" }] },
};
const ALIASES = { version: 1, count: 1, aliases: { "gpt-4o-latest": { vendor: "openai", id: "gpt-4o" } } };

// Faceted slice + change feed (T48).
const BY_CAPABILITY_VISION = {
  version: 1,
  capability: "vision",
  vendors: { openai: [{ id: "gpt-4o", label: "GPT-4o", kind: "CHAT", vendor: "openai" }] },
};
const BY_MODALITY_IMAGE = {
  version: 1,
  modality: "image",
  vendors: { openai: [{ id: "gpt-4o", label: "GPT-4o", kind: "CHAT", vendor: "openai" }] },
};
const CHANGES = {
  version: 1,
  previousLastUpdated: "2026-07-20",
  baseline: "present",
  counts: { added: 1, removed: 0, changed: 0 },
  added: [{ vendor: "openai", id: "gpt-4o", kind: "CHAT", label: "GPT-4o" }],
  removed: [],
  changed: [],
};

/** Build a fake fetch that counts calls and serves the fixtures above. */
function fakeFetch() {
  const calls = [];
  const routes = {
    [`${BASE}/catalog.json`]: CATALOG,
    [`${BASE}/catalog-v1.json`]: CATALOG,
    [`${BASE}/index.json`]: CATALOG,
    [`${BASE}/by-kind/EMBEDDING.json`]: BY_KIND_EMBEDDING,
    [`${BASE}/endpoints.json`]: ENDPOINTS,
    [`${BASE}/stats.json`]: STATS,
    [`${BASE}/coverage.json`]: COVERAGE,
    [`${BASE}/providers.json`]: PROVIDERS,
    [`${BASE}/plans.json`]: PLANS,
    [`${BASE}/aliases.json`]: ALIASES,
    [`${BASE}/by-capability/vision.json`]: BY_CAPABILITY_VISION,
    [`${BASE}/by-modality/image.json`]: BY_MODALITY_IMAGE,
    [`${BASE}/changes.json`]: CHANGES,
  };
  const fn = async (url) => {
    calls.push(url);
    if (!(url in routes)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => routes[url] };
  };
  fn.calls = calls;
  return fn;
}

test("exports the kind taxonomy and default base url", () => {
  assert.equal(typeof DEFAULT_BASE_URL, "string");
  assert.ok(KINDS.includes("EMBEDDING"));
  assert.equal(KINDS.length, 9);
});

test("all() flattens vendors and backfills the vendor key", async () => {
  const fetch = fakeFetch();
  const c = new ModelCatalogClient({ baseUrl: BASE, fetch });
  const all = await c.all();
  assert.equal(all.length, 3);
  // Every entry carries a vendor, including the vendor that omitted it in the source.
  assert.deepEqual(
    all.map((e) => e.vendor).sort(),
    ["anthropic", "openai", "openai"],
  );
});

test("Block F/I additive fields (pricing/benchmarks/performance/openWeights/parameters) pass through", async () => {
  const c = new ModelCatalogClient({ baseUrl: BASE, fetch: fakeFetch() });
  const gpt = await c.get("openai", "gpt-4o");
  assert.equal(gpt.openWeights, false);
  assert.equal(gpt.parameters, 200000000000);
  assert.equal(gpt.pricing.inputPer1M, 2.5);
  assert.equal(gpt.pricing.indicative, true);
  assert.equal(gpt.benchmarks.intelligenceIndex, 71);
  assert.equal(gpt.benchmarks.scores.coding.value, 55);
  assert.equal(gpt.performance.throughputTps, 120);
  assert.equal(gpt.performance.latencyTtftSec, 0.42);
});

test("byKind / byVendor / get filter correctly and are case-insensitive", async () => {
  const c = new ModelCatalogClient({ baseUrl: BASE, fetch: fakeFetch() });
  const embeddings = await c.byKind("embedding");
  assert.equal(embeddings.length, 1);
  assert.equal(embeddings[0].id, "text-embedding-3-large");

  const openai = await c.byVendor("OpenAI");
  assert.equal(openai.length, 2);

  const one = await c.get("openai", "gpt-4o");
  assert.equal(one.label, "GPT-4o");
  assert.equal(await c.get("openai", "nope"), null);
});

test("vendors() returns the distinct keys", async () => {
  const c = new ModelCatalogClient({ baseUrl: BASE, fetch: fakeFetch() });
  assert.deepEqual((await c.vendors()).sort(), ["anthropic", "openai"]);
});

test("caches by default: repeated reads fetch once; refresh() re-fetches", async () => {
  const fetch = fakeFetch();
  const c = new ModelCatalogClient({ baseUrl: BASE, fetch });
  await c.all();
  await c.byKind("CHAT");
  await c.byVendor("openai");
  assert.equal(fetch.calls.length, 1, "one fetch backs many reads");
  await c.refresh();
  assert.equal(fetch.calls.length, 2, "refresh forces a re-fetch");
});

test("ttl expiry triggers a re-fetch; clear() drops the cache", async () => {
  const fetch = fakeFetch();
  let clock = 1000;
  const c = new ModelCatalogClient({ baseUrl: BASE, fetch, ttlMs: 100, now: () => clock });
  await c.all();
  clock += 50; // still fresh
  await c.all();
  assert.equal(fetch.calls.length, 1);
  clock += 100; // now stale
  await c.all();
  assert.equal(fetch.calls.length, 2);
  c.clear();
  await c.all();
  assert.equal(fetch.calls.length, 3);
});

test("pinnedVersion and compact select the right path", async () => {
  const pinned = fakeFetch();
  await new ModelCatalogClient({ baseUrl: BASE, fetch: pinned, pinnedVersion: 1 }).all();
  assert.equal(pinned.calls[0], `${BASE}/catalog-v1.json`);

  const compact = fakeFetch();
  await new ModelCatalogClient({ baseUrl: BASE, fetch: compact, compact: true }).all();
  assert.equal(compact.calls[0], `${BASE}/index.json`);
});

test("faceted slice loaders and endpoints() hit their own paths", async () => {
  const fetch = fakeFetch();
  const c = new ModelCatalogClient({ baseUrl: BASE, fetch });
  const embeddings = await c.fetchByKind("EMBEDDING");
  assert.equal(embeddings.length, 1);
  assert.equal(fetch.calls[0], `${BASE}/by-kind/EMBEDDING.json`);
  const manifest = await c.endpoints();
  assert.equal(manifest.latest, `${BASE}/catalog.json`);
});

test("aggregate & registry accessors hit their own paths and return the published shape", async () => {
  const fetch = fakeFetch();
  const c = new ModelCatalogClient({ baseUrl: BASE, fetch });
  const stats = await c.stats();
  assert.equal(fetch.calls[0], `${BASE}/stats.json`);
  assert.equal(stats.totals.models, 3);
  assert.equal(stats.coverage.fields.pricing.filled, 1);

  const coverage = await c.coverage();
  assert.equal(fetch.calls[1], `${BASE}/coverage.json`);
  assert.equal(coverage.byVendor.openai.total, 2);

  const providers = await c.providers();
  assert.equal(fetch.calls[2], `${BASE}/providers.json`);
  assert.equal(providers.providers[0].category, "model-creator");

  const plans = await c.plans();
  assert.equal(fetch.calls[3], `${BASE}/plans.json`);
  assert.equal(plans.plans.anthropic[0].indicative, true);

  const aliases = await c.aliases();
  assert.equal(fetch.calls[4], `${BASE}/aliases.json`);
  assert.deepEqual(aliases.aliases["gpt-4o-latest"], { vendor: "openai", id: "gpt-4o" });
});

test("capability/modality slice loaders + change feed hit their own paths", async () => {
  const fetch = fakeFetch();
  const c = new ModelCatalogClient({ baseUrl: BASE, fetch });
  const vision = await c.fetchByCapability("Vision"); // case-insensitive → lowercased path
  assert.equal(fetch.calls[0], `${BASE}/by-capability/vision.json`);
  assert.equal(vision.length, 1);
  assert.equal(vision[0].vendor, "openai");

  const image = await c.fetchByModality("IMAGE");
  assert.equal(fetch.calls[1], `${BASE}/by-modality/image.json`);
  assert.equal(image[0].id, "gpt-4o");

  const changes = await c.changes();
  assert.equal(fetch.calls[2], `${BASE}/changes.json`);
  assert.equal(changes.counts.added, 1);
  assert.equal(changes.added[0].id, "gpt-4o");
});

test("a non-ok response throws with the url and status", async () => {
  const fetch = fakeFetch();
  const c = new ModelCatalogClient({ baseUrl: "https://example.test/missing", fetch });
  await assert.rejects(() => c.all(), /HTTP 404/);
});

test("trailing slashes in baseUrl are normalized", async () => {
  const fetch = fakeFetch();
  const c = new ModelCatalogClient({ baseUrl: `${BASE}///`, fetch });
  await c.all();
  assert.equal(fetch.calls[0], `${BASE}/catalog.json`);
});
