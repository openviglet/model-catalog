package io.github.openviglet.modelcatalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

/**
 * Offline unit tests for {@link ModelCatalogClient}. A fake {@link ModelCatalogClient.Fetcher}
 * serves a tiny in-memory catalog so the tests never touch the network; an injected clock drives
 * the TTL assertions without sleeping.
 */
class ModelCatalogClientTest {

    private static final String BASE = "https://example.test/models";

    private static final String CATALOG = """
            {
              "version": 1,
              "lastUpdated": "2026-07-21",
              "source": "https://example.test/models",
              "vendors": {
                "openai": [
                  { "id": "gpt-4o", "label": "GPT-4o", "kind": "CHAT", "contextWindow": 128000,
                    "capabilities": ["vision", "tools"],
                    "openWeights": false, "parameters": 200000000000,
                    "pricing": { "inputPer1M": 2.5, "outputPer1M": 10, "currency": "USD",
                      "unit": "per_1M_tokens", "indicative": true, "source": "litellm",
                      "lastVerified": "2026-07-20" },
                    "benchmarks": { "intelligenceIndex": 71, "arenaElo": 1342,
                      "scores": { "coding": { "value": 55 }, "reasoning": { "value": 80 } },
                      "indicative": true, "source": "Artificial Analysis", "lastVerified": "2026-07-20" },
                    "performance": { "throughputTps": 120, "latencyTtftSec": 0.42,
                      "indicative": true, "source": "Artificial Analysis", "lastVerified": "2026-07-20" } },
                  { "id": "text-embedding-3-large", "label": "Embedding 3 Large", "kind": "EMBEDDING",
                    "embeddingDimensions": 3072, "futureField": "kept" }
                ],
                "anthropic": [
                  { "id": "claude-opus-4-8", "label": "Claude Opus 4.8", "kind": "CHAT" }
                ]
              }
            }
            """;

    private static final String BY_KIND_EMBEDDING = """
            {
              "version": 1, "lastUpdated": "2026-07-21", "kind": "EMBEDDING",
              "vendors": {
                "openai": [
                  { "id": "text-embedding-3-large", "label": "Embedding 3 Large", "kind": "EMBEDDING",
                    "vendor": "openai" }
                ]
              }
            }
            """;

    private static final String ENDPOINTS = """
            { "version": 1, "latest": "https://example.test/models/catalog.json", "byKind": {}, "byVendor": {} }
            """;

    // Aggregate & registry artifacts (T47) — trimmed to the shape the accessors return.
    private static final String STATS = """
            { "version": 1, "totals": { "models": 3, "vendors": 2, "kinds": 2, "capabilities": 0 },
              "byVendor": { "openai": 2, "anthropic": 1 },
              "coverage": { "total": 3, "fields": { "pricing": { "filled": 1, "rate": 0.3333 } } } }
            """;

    private static final String COVERAGE = """
            { "version": 1, "fields": ["pricing"],
              "overall": { "total": 3, "fields": { "pricing": { "filled": 1, "rate": 0.3333 } } },
              "byVendor": { "openai": { "total": 2, "fields": { "pricing": { "filled": 1, "rate": 0.5 } } } } }
            """;

    private static final String PROVIDERS = """
            { "version": 1, "providers": [
              { "id": "openai", "name": "OpenAI", "category": "model-creator", "catalogVendor": "openai" } ] }
            """;

    private static final String PLANS = """
            { "version": 1, "plans": { "anthropic": [
              { "id": "claude-pro", "name": "Claude Pro", "indicative": true, "source": "anthropic.com",
                "lastVerified": "2026-07-20", "vendor": "anthropic" } ] } }
            """;

    private static final String ALIASES = """
            { "version": 1, "count": 1, "aliases": { "gpt-4o-latest": { "vendor": "openai", "id": "gpt-4o" } } }
            """;

    /** A fake fetcher that records calls and serves the fixtures above. */
    static final class FakeFetcher implements ModelCatalogClient.Fetcher {
        final List<String> calls = new ArrayList<>();
        private final Map<String, String> routes = new HashMap<>();

        FakeFetcher() {
            routes.put(BASE + "/catalog.json", CATALOG);
            routes.put(BASE + "/catalog-v1.json", CATALOG);
            routes.put(BASE + "/index.json", CATALOG);
            routes.put(BASE + "/by-kind/EMBEDDING.json", BY_KIND_EMBEDDING);
            routes.put(BASE + "/endpoints.json", ENDPOINTS);
            routes.put(BASE + "/stats.json", STATS);
            routes.put(BASE + "/coverage.json", COVERAGE);
            routes.put(BASE + "/providers.json", PROVIDERS);
            routes.put(BASE + "/plans.json", PLANS);
            routes.put(BASE + "/aliases.json", ALIASES);
        }

        @Override
        public String get(String url) throws IOException {
            calls.add(url);
            String body = routes.get(url);
            if (body == null) {
                throw new IOException("GET " + url + " -> HTTP 404");
            }
            return body;
        }
    }

    private static ModelCatalogClient.Builder client(FakeFetcher fetcher) {
        return ModelCatalogClient.builder().baseUrl(BASE).fetcher(fetcher);
    }

    @Test
    void allFlattensAndBackfillsVendor() {
        ModelCatalogClient c = client(new FakeFetcher()).build();
        List<ModelEntry> all = c.all();
        assertEquals(3, all.size());
        long openai = all.stream().filter(e -> e.vendor().equals("openai")).count();
        long anthropic = all.stream().filter(e -> e.vendor().equals("anthropic")).count();
        assertEquals(2, openai);
        assertEquals(1, anthropic);
    }

    @Test
    void typedFieldsAndExtra() {
        ModelCatalogClient c = client(new FakeFetcher()).build();
        ModelEntry gpt = c.get("openai", "gpt-4o").orElseThrow();
        assertEquals(Kind.CHAT, gpt.kind());
        assertEquals(128000, gpt.contextWindow());
        assertTrue(gpt.capabilities().contains("vision"));
        ModelEntry emb = c.get("openai", "text-embedding-3-large").orElseThrow();
        assertEquals(3072, emb.embeddingDimensions());
        assertEquals("kept", emb.extra().get("futureField"));
    }

    @Test
    void blockFandIadditiveFields() {
        ModelCatalogClient c = client(new FakeFetcher()).build();
        ModelEntry gpt = c.get("openai", "gpt-4o").orElseThrow();
        assertEquals(Boolean.FALSE, gpt.openWeights());
        assertEquals(200000000000L, gpt.parameters().longValue());
        assertEquals(2.5, gpt.pricing().inputPer1M());
        assertEquals(Boolean.TRUE, gpt.pricing().indicative());
        assertEquals(71.0, gpt.benchmarks().intelligenceIndex());
        assertEquals(55.0, gpt.benchmarks().scores().get("coding").value());
        assertEquals(120.0, gpt.performance().throughputTps());
        assertEquals(0.42, gpt.performance().latencyTtftSec());
    }

    @Test
    void byKindByVendorGetCaseInsensitive() {
        ModelCatalogClient c = client(new FakeFetcher()).build();
        assertEquals(1, c.byKind(Kind.EMBEDDING).size());
        assertEquals(1, c.byKind("embedding").size());
        assertEquals(2, c.byVendor("OpenAI").size());
        assertEquals("GPT-4o", c.get("openai", "gpt-4o").orElseThrow().label());
        assertEquals(Optional.empty(), c.get("openai", "nope"));
    }

    @Test
    void unknownKindMapsToUnknown() {
        assertEquals(Kind.UNKNOWN, Kind.fromString("something-new"));
        assertEquals(Kind.UNKNOWN, Kind.fromString(null));
    }

    @Test
    void vendorsListsDistinctKeys() {
        ModelCatalogClient c = client(new FakeFetcher()).build();
        List<String> vendors = c.vendors();
        assertEquals(2, vendors.size());
        assertTrue(vendors.contains("openai"));
        assertTrue(vendors.contains("anthropic"));
    }

    @Test
    void cachesByDefaultAndRefreshRefetches() {
        FakeFetcher fetcher = new FakeFetcher();
        ModelCatalogClient c = client(fetcher).build();
        c.all();
        c.byKind(Kind.CHAT);
        c.byVendor("openai");
        assertEquals(1, fetcher.calls.size());
        c.refresh();
        assertEquals(2, fetcher.calls.size());
    }

    @Test
    void ttlExpiryAndClear() {
        FakeFetcher fetcher = new FakeFetcher();
        AtomicLong clock = new AtomicLong(1000);
        ModelCatalogClient c = client(fetcher)
                .ttl(java.time.Duration.ofMillis(100))
                .clock(clock::get)
                .build();
        c.all();
        clock.addAndGet(50); // still fresh
        c.all();
        assertEquals(1, fetcher.calls.size());
        clock.addAndGet(100); // stale
        c.all();
        assertEquals(2, fetcher.calls.size());
        c.clear();
        c.all();
        assertEquals(3, fetcher.calls.size());
    }

    @Test
    void pinnedAndCompactPaths() {
        FakeFetcher pinned = new FakeFetcher();
        client(pinned).pinnedVersion(1).build().all();
        assertEquals(BASE + "/catalog-v1.json", pinned.calls.get(0));

        FakeFetcher compact = new FakeFetcher();
        client(compact).compact(true).build().all();
        assertEquals(BASE + "/index.json", compact.calls.get(0));
    }

    @Test
    void facetedSlicesAndEndpoints() {
        FakeFetcher fetcher = new FakeFetcher();
        ModelCatalogClient c = client(fetcher).build();
        List<ModelEntry> emb = c.fetchByKind("EMBEDDING");
        assertEquals(1, emb.size());
        assertEquals(BASE + "/by-kind/EMBEDDING.json", fetcher.calls.get(0));
        Map<String, Object> manifest = c.endpoints();
        assertEquals(BASE + "/catalog.json", manifest.get("latest"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void aggregateAndRegistryAccessors() {
        FakeFetcher fetcher = new FakeFetcher();
        ModelCatalogClient c = client(fetcher).build();

        Map<String, Object> stats = c.stats();
        assertEquals(BASE + "/stats.json", fetcher.calls.get(0));
        assertEquals(3L, ((Map<String, Object>) stats.get("totals")).get("models"));

        Map<String, Object> coverage = c.coverage();
        assertEquals(BASE + "/coverage.json", fetcher.calls.get(1));
        Map<String, Object> byVendor = (Map<String, Object>) coverage.get("byVendor");
        assertEquals(2L, ((Map<String, Object>) byVendor.get("openai")).get("total"));

        Map<String, Object> providers = c.providers();
        assertEquals(BASE + "/providers.json", fetcher.calls.get(2));
        List<Object> provList = (List<Object>) providers.get("providers");
        assertEquals("model-creator", ((Map<String, Object>) provList.get(0)).get("category"));

        Map<String, Object> plans = c.plans();
        assertEquals(BASE + "/plans.json", fetcher.calls.get(3));
        Map<String, Object> plansByVendor = (Map<String, Object>) plans.get("plans");
        List<Object> anthropic = (List<Object>) plansByVendor.get("anthropic");
        assertEquals(Boolean.TRUE, ((Map<String, Object>) anthropic.get(0)).get("indicative"));

        Map<String, Object> aliases = c.aliases();
        assertEquals(BASE + "/aliases.json", fetcher.calls.get(4));
        Map<String, Object> target = (Map<String, Object>) ((Map<String, Object>) aliases.get("aliases")).get("gpt-4o-latest");
        assertEquals("openai", target.get("vendor"));
        assertEquals("gpt-4o", target.get("id"));
    }

    @Test
    void nonOkResponseThrowsCatalogException() {
        ModelCatalogClient c = ModelCatalogClient.builder()
                .baseUrl("https://example.test/missing")
                .fetcher(new FakeFetcher())
                .build();
        CatalogException ex = assertThrows(CatalogException.class, c::all);
        assertNotNull(ex.getCause());
    }

    @Test
    void baseUrlTrailingSlashesNormalized() {
        FakeFetcher fetcher = new FakeFetcher();
        client(fetcher).baseUrl(BASE + "///").build().all();
        assertEquals(BASE + "/catalog.json", fetcher.calls.get(0));
    }
}
