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
      { id: "gpt-4o", label: "GPT-4o", kind: "CHAT" },
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

/** Build a fake fetch that counts calls and serves the fixtures above. */
function fakeFetch() {
  const calls = [];
  const routes = {
    [`${BASE}/catalog.json`]: CATALOG,
    [`${BASE}/catalog-v1.json`]: CATALOG,
    [`${BASE}/index.json`]: CATALOG,
    [`${BASE}/by-kind/EMBEDDING.json`]: BY_KIND_EMBEDDING,
    [`${BASE}/endpoints.json`]: ENDPOINTS,
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
