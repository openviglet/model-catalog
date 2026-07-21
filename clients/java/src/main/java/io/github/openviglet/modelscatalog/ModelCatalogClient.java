package io.github.openviglet.modelscatalog;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;

/**
 * Zero-dependency, read-only client for the open, community catalog of AI models
 * (<a href="https://openviglet.github.io/models-catalog">openviglet/models-catalog</a>):
 * a vendor-neutral, kind-aware list of LLMs, embeddings, rerankers and multimodal
 * models, free for anyone to use.
 *
 * <p>The catalog is just JSON over HTTPS; this client removes the boilerplate every
 * JVM consumer would otherwise re-invent — URL selection (rolling vs pinned
 * {@code catalog-vN.json}, or the compact {@code index.json}), flattening the
 * {@code vendors} map into {@link ModelEntry} records that carry their {@code vendor},
 * {@code byKind}/{@code byVendor}/{@code get} filtering, and in-memory caching with an
 * optional TTL. It carries no pricing — identity, kind and capability only.
 *
 * <p>Fetches over the JDK {@link HttpClient} (no HTTP framework) and parses with a tiny
 * built-in reader (no JSON framework). Build via {@link #builder()} or {@link #create()};
 * instances are safe for reuse but not intended for concurrent mutation of the cache.
 *
 * <pre>{@code
 * var catalog = ModelCatalogClient.create();
 * List<ModelEntry> embeddings = catalog.byKind(Kind.EMBEDDING);
 * }</pre>
 */
public final class ModelCatalogClient {

    /** Default public endpoint (GitHub Pages, CORS-open). */
    public static final String DEFAULT_BASE_URL = "https://openviglet.github.io/models-catalog";

    private static final String USER_AGENT =
            "openviglet-models-catalog-client/1.0 (+https://github.com/openviglet/models-catalog)";

    /** Pluggable transport: {@code url -> response body}. The default uses {@link HttpClient}. */
    @FunctionalInterface
    public interface Fetcher {
        String get(String url) throws IOException, InterruptedException;
    }

    private final String baseUrl;
    private final long ttlMillis;
    private final Integer pinnedVersion;
    private final boolean compact;
    private final Fetcher fetcher;
    private final Supplier<Long> clock;

    private Cache cache;

    private ModelCatalogClient(Builder b) {
        String base = b.baseUrl;
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        this.baseUrl = base;
        this.ttlMillis = b.ttlMillis;
        this.pinnedVersion = b.pinnedVersion;
        this.compact = b.compact;
        this.fetcher = b.fetcher != null ? b.fetcher : new HttpFetcher(b.timeout);
        this.clock = b.clock;
    }

    /** A client against the default public endpoint with default settings. */
    public static ModelCatalogClient create() {
        return builder().build();
    }

    public static Builder builder() {
        return new Builder();
    }

    // --- loading --------------------------------------------------------------

    /** Ensure the catalog is loaded (fetch only when empty/stale). Returns the {@link Catalog}. */
    public Catalog load() {
        if (isFresh()) {
            return cache.catalog;
        }
        return refresh();
    }

    /** Force a fresh fetch, replacing the cache. Returns the {@link Catalog}. */
    public Catalog refresh() {
        Map<String, Object> envelope = Json.parseObject(fetch(primaryPath()));
        Catalog catalog = toCatalog(envelope);
        this.cache = new Cache(clock.get(), catalog);
        return catalog;
    }

    /** Drop the in-memory cache; the next access re-fetches. */
    public void clear() {
        this.cache = null;
    }

    // --- accessors ------------------------------------------------------------

    /** All entries across every vendor. */
    public List<ModelEntry> all() {
        return new ArrayList<>(entries());
    }

    /** Entries of a given kind. */
    public List<ModelEntry> byKind(Kind kind) {
        List<ModelEntry> out = new ArrayList<>();
        for (ModelEntry e : entries()) {
            if (e.kind() == kind) {
                out.add(e);
            }
        }
        return out;
    }

    /** Entries of a given kind (case-insensitive string; unknown -> {@link Kind#UNKNOWN}). */
    public List<ModelEntry> byKind(String kind) {
        return byKind(Kind.fromString(kind));
    }

    /** Entries of a given vendor (case-insensitive). */
    public List<ModelEntry> byVendor(String vendor) {
        String v = vendor.toLowerCase(Locale.ROOT);
        List<ModelEntry> out = new ArrayList<>();
        for (ModelEntry e : entries()) {
            if (v.equals(e.vendor())) {
                out.add(e);
            }
        }
        return out;
    }

    /** A single entry by (vendor, id), if present. */
    public Optional<ModelEntry> get(String vendor, String id) {
        String v = vendor.toLowerCase(Locale.ROOT);
        for (ModelEntry e : entries()) {
            if (v.equals(e.vendor()) && id.equals(e.id())) {
                return Optional.of(e);
            }
        }
        return Optional.empty();
    }

    /** The distinct vendor keys present in the catalog (insertion order). */
    public List<String> vendors() {
        Set<String> seen = new LinkedHashSet<>();
        for (ModelEntry e : entries()) {
            seen.add(e.vendor());
        }
        return new ArrayList<>(seen);
    }

    // --- faceted slices (smaller pre-filtered payloads) -----------------------

    /** Fetch the {@code by-kind/<KIND>.json} slice directly (smaller payload). */
    public List<ModelEntry> fetchByKind(String kind) {
        return flatten(Json.parseObject(fetch("by-kind/" + kind.toUpperCase(Locale.ROOT) + ".json")));
    }

    /** Fetch the {@code by-vendor/<vendor>.json} slice directly (smaller payload). */
    public List<ModelEntry> fetchByVendor(String vendor) {
        return flatten(Json.parseObject(fetch("by-vendor/" + vendor.toLowerCase(Locale.ROOT) + ".json")));
    }

    /** The discovery manifest ({@code endpoints.json}) as a raw map of every published path. */
    public Map<String, Object> endpoints() {
        return Json.parseObject(fetch("endpoints.json"));
    }

    // --- internals ------------------------------------------------------------

    private List<ModelEntry> entries() {
        load();
        return cache.catalog.entries();
    }

    private boolean isFresh() {
        if (cache == null) {
            return false;
        }
        if (ttlMillis <= 0) {
            return true;
        }
        return (clock.get() - cache.fetchedAt) < ttlMillis;
    }

    private String primaryPath() {
        if (compact) {
            return "index.json";
        }
        return pinnedVersion != null ? "catalog-v" + pinnedVersion + ".json" : "catalog.json";
    }

    private String fetch(String path) {
        String url = baseUrl + "/" + path;
        try {
            return fetcher.get(url);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new CatalogException("model-catalog: interrupted fetching " + url, ex);
        } catch (IOException ex) {
            throw new CatalogException("model-catalog: failed fetching " + url, ex);
        }
    }

    private static Catalog toCatalog(Map<String, Object> env) {
        int version = env.get("version") instanceof Number n ? n.intValue() : 0;
        String lastUpdated = env.get("lastUpdated") instanceof String s ? s : null;
        String source = env.get("source") instanceof String s ? s : null;
        return new Catalog(version, lastUpdated, source, flatten(env));
    }

    @SuppressWarnings("unchecked")
    private static List<ModelEntry> flatten(Map<String, Object> env) {
        List<ModelEntry> out = new ArrayList<>();
        if (env.get("vendors") instanceof Map<?, ?> vendors) {
            for (Map.Entry<?, ?> e : vendors.entrySet()) {
                String vendor = String.valueOf(e.getKey());
                if (e.getValue() instanceof List<?> list) {
                    for (Object item : list) {
                        if (item instanceof Map<?, ?> m) {
                            out.add(ModelEntry.fromJson((Map<String, Object>) m, vendor));
                        }
                    }
                }
            }
        }
        return out;
    }

    private record Cache(long fetchedAt, Catalog catalog) {
    }

    /** Default transport over the JDK {@link HttpClient}. */
    private static final class HttpFetcher implements Fetcher {
        private final HttpClient http = HttpClient.newHttpClient();
        private final Duration timeout;

        HttpFetcher(Duration timeout) {
            this.timeout = timeout;
        }

        @Override
        public String get(String url) throws IOException, InterruptedException {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(timeout)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new IOException("GET " + url + " -> HTTP " + response.statusCode());
            }
            return response.body();
        }
    }

    /** Fluent builder for a {@link ModelCatalogClient}. */
    public static final class Builder {
        private String baseUrl = DEFAULT_BASE_URL;
        private long ttlMillis = 0;
        private Integer pinnedVersion = null;
        private boolean compact = false;
        private Duration timeout = Duration.ofSeconds(30);
        private Fetcher fetcher = null;
        private Supplier<Long> clock = System::currentTimeMillis;

        /** Endpoint base (default {@link #DEFAULT_BASE_URL}). */
        public Builder baseUrl(String value) {
            this.baseUrl = value;
            return this;
        }

        /** Cache lifetime; zero (default) caches until {@link #refresh()}. */
        public Builder ttl(Duration value) {
            this.ttlMillis = value == null ? 0 : value.toMillis();
            return this;
        }

        /** Load {@code catalog-vN.json} instead of the rolling {@code catalog.json}. */
        public Builder pinnedVersion(int value) {
            this.pinnedVersion = value;
            return this;
        }

        /** Load the compact {@code index.json} (trimmed entries). */
        public Builder compact(boolean value) {
            this.compact = value;
            return this;
        }

        /** Per-request timeout for the default HTTP transport. */
        public Builder timeout(Duration value) {
            this.timeout = value;
            return this;
        }

        /** Custom transport (e.g. for tests); default uses the JDK {@link HttpClient}. */
        public Builder fetcher(Fetcher value) {
            this.fetcher = value;
            return this;
        }

        /** Clock for TTL (default {@code System::currentTimeMillis}); injectable for tests. */
        Builder clock(Supplier<Long> value) {
            this.clock = value;
            return this;
        }

        public ModelCatalogClient build() {
            return new ModelCatalogClient(this);
        }
    }
}
