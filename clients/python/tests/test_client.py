"""Offline unit tests for the Python catalog client (stdlib ``unittest``).

A fake ``fetch`` serves a tiny in-memory catalog so the tests never touch the network;
an injected monotonic clock drives the TTL assertions without sleeping.

    python -m unittest discover -s tests
"""

import unittest

from model_catalog_client import KINDS, ModelCatalogClient, ModelEntry

BASE = "https://example.test/models"

CATALOG = {
    "version": 1,
    "lastUpdated": "2026-07-21",
    "source": BASE,
    "vendors": {
        "openai": [
            {
                "id": "gpt-4o",
                "label": "GPT-4o",
                "kind": "CHAT",
                "contextWindow": 128000,
                # Illustrative values — exercises the Block F/I additive fields.
                "openWeights": False,
                "parameters": 200000000000,
                "pricing": {"inputPer1M": 2.5, "outputPer1M": 10, "currency": "USD", "unit": "per_1M_tokens", "indicative": True, "source": "litellm", "lastVerified": "2026-07-20"},
                "benchmarks": {"intelligenceIndex": 71, "arenaElo": 1342, "scores": {"coding": {"value": 55}, "reasoning": {"value": 80}}, "indicative": True, "source": "Artificial Analysis", "lastVerified": "2026-07-20"},
                "performance": {"throughputTps": 120, "latencyTtftSec": 0.42, "indicative": True, "source": "Artificial Analysis", "lastVerified": "2026-07-20"},
            },
            {
                "id": "text-embedding-3-large",
                "label": "Embedding 3 Large",
                "kind": "EMBEDDING",
                "embeddingDimensions": 3072,
                # An unknown key exercises additive-schema tolerance.
                "futureField": "ignored-but-kept",
            },
        ],
        # Second vendor omits per-entry "vendor" to prove backfill from the key.
        "anthropic": [{"id": "claude-opus-4-8", "label": "Claude Opus 4.8", "kind": "CHAT"}],
    },
}

BY_KIND_EMBEDDING = {
    "version": 1,
    "lastUpdated": "2026-07-21",
    "kind": "EMBEDDING",
    "vendors": {
        "openai": [
            {"id": "text-embedding-3-large", "label": "Embedding 3 Large", "kind": "EMBEDDING", "vendor": "openai"}
        ]
    },
}

ENDPOINTS = {"version": 1, "latest": BASE + "/catalog.json", "byKind": {}, "byVendor": {}}


def make_fetch():
    """A fake fetch that records calls and serves the fixtures above."""
    calls = []
    routes = {
        BASE + "/catalog.json": CATALOG,
        BASE + "/catalog-v1.json": CATALOG,
        BASE + "/index.json": CATALOG,
        BASE + "/by-kind/EMBEDDING.json": BY_KIND_EMBEDDING,
        BASE + "/endpoints.json": ENDPOINTS,
    }

    def fetch(url):
        calls.append(url)
        if url not in routes:
            raise RuntimeError("HTTP 404: " + url)
        return routes[url]

    fetch.calls = calls
    return fetch


class ClientTest(unittest.TestCase):
    def test_kinds_exported(self):
        self.assertIn("EMBEDDING", KINDS)
        self.assertEqual(len(KINDS), 9)

    def test_all_flattens_and_backfills_vendor(self):
        c = ModelCatalogClient(base_url=BASE, fetch=make_fetch())
        entries = c.all()
        self.assertEqual(len(entries), 3)
        self.assertEqual(sorted(e.vendor for e in entries), ["anthropic", "openai", "openai"])
        self.assertTrue(all(isinstance(e, ModelEntry) for e in entries))

    def test_snake_case_and_extra_fields(self):
        c = ModelCatalogClient(base_url=BASE, fetch=make_fetch())
        emb = c.get("openai", "text-embedding-3-large")
        self.assertEqual(emb.embedding_dimensions, 3072)
        self.assertEqual(emb.extra["futureField"], "ignored-but-kept")
        gpt = c.get("openai", "gpt-4o")
        self.assertEqual(gpt.context_window, 128000)

    def test_block_f_i_additive_fields(self):
        c = ModelCatalogClient(base_url=BASE, fetch=make_fetch())
        gpt = c.get("openai", "gpt-4o")
        self.assertIs(gpt.open_weights, False)
        self.assertEqual(gpt.parameters, 200000000000)
        self.assertEqual(gpt.pricing["inputPer1M"], 2.5)
        self.assertIs(gpt.pricing["indicative"], True)
        self.assertEqual(gpt.benchmarks["intelligenceIndex"], 71)
        self.assertEqual(gpt.benchmarks["scores"]["coding"]["value"], 55)
        self.assertEqual(gpt.performance["throughputTps"], 120)
        self.assertEqual(gpt.performance["latencyTtftSec"], 0.42)

    def test_by_kind_by_vendor_get_case_insensitive(self):
        c = ModelCatalogClient(base_url=BASE, fetch=make_fetch())
        self.assertEqual(len(c.by_kind("embedding")), 1)
        self.assertEqual(len(c.by_vendor("OpenAI")), 2)
        self.assertEqual(c.get("openai", "gpt-4o").label, "GPT-4o")
        self.assertIsNone(c.get("openai", "nope"))

    def test_vendors(self):
        c = ModelCatalogClient(base_url=BASE, fetch=make_fetch())
        self.assertEqual(sorted(c.vendors()), ["anthropic", "openai"])

    def test_caches_by_default_and_refresh_refetches(self):
        fetch = make_fetch()
        c = ModelCatalogClient(base_url=BASE, fetch=fetch)
        c.all()
        c.by_kind("CHAT")
        c.by_vendor("openai")
        self.assertEqual(len(fetch.calls), 1)
        c.refresh()
        self.assertEqual(len(fetch.calls), 2)

    def test_ttl_expiry_and_clear(self):
        fetch = make_fetch()
        clock = {"t": 1000.0}
        c = ModelCatalogClient(base_url=BASE, fetch=fetch, ttl=100, now=lambda: clock["t"])
        c.all()
        clock["t"] += 50  # still fresh
        c.all()
        self.assertEqual(len(fetch.calls), 1)
        clock["t"] += 100  # stale
        c.all()
        self.assertEqual(len(fetch.calls), 2)
        c.clear()
        c.all()
        self.assertEqual(len(fetch.calls), 3)

    def test_pinned_and_compact_paths(self):
        pinned = make_fetch()
        ModelCatalogClient(base_url=BASE, fetch=pinned, pinned_version=1).all()
        self.assertEqual(pinned.calls[0], BASE + "/catalog-v1.json")

        compact = make_fetch()
        ModelCatalogClient(base_url=BASE, fetch=compact, compact=True).all()
        self.assertEqual(compact.calls[0], BASE + "/index.json")

    def test_faceted_slices_and_endpoints(self):
        fetch = make_fetch()
        c = ModelCatalogClient(base_url=BASE, fetch=fetch)
        emb = c.fetch_by_kind("EMBEDDING")
        self.assertEqual(len(emb), 1)
        self.assertEqual(fetch.calls[0], BASE + "/by-kind/EMBEDDING.json")
        self.assertEqual(c.endpoints()["latest"], BASE + "/catalog.json")

    def test_base_url_trailing_slashes_normalized(self):
        fetch = make_fetch()
        ModelCatalogClient(base_url=BASE + "///", fetch=fetch).all()
        self.assertEqual(fetch.calls[0], BASE + "/catalog.json")


if __name__ == "__main__":
    unittest.main()
