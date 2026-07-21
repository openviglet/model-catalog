# models-catalog-client (Java)

Zero-dependency, read-only Java client for the
[open model catalog](https://openviglet.github.io/models-catalog) — a free,
community-maintained, vendor-neutral list of AI models (LLMs, embeddings, rerankers
and multimodal), with each model's kind, context window, capabilities and more.

The catalog is just JSON over HTTPS, so you *can* fetch it directly. This client
removes the boilerplate: URL selection (rolling vs pinned `catalog-vN.json`, or the
compact `index.json`), flattening the `vendors` map into typed `record` entries that
carry their `vendor`, `byKind`/`byVendor`/`get` filtering, and in-memory caching with
an optional TTL. It carries **no pricing** — identity, kind and capability only.

- **No runtime dependencies.** Uses only the JDK `java.net.http.HttpClient` plus a
  tiny built-in JSON reader — no HTTP or JSON framework. JUnit is test-scoped and never
  ships with the jar.
- **Typed.** `ModelEntry` / `Modalities` / `Catalog` are `record`s; `Kind` is an enum
  (unknown values map to `UNKNOWN`), and unknown JSON keys are kept in
  `ModelEntry.extra()` so a future additive-schema field never breaks your code.
- **Java 17+.**

The catalog is open and grows with the community — [contributions welcome](https://github.com/openviglet/models-catalog).

## Install

The repo is **public**, so nothing below needs authentication.

From Maven Central — public, no auth:

```xml
<dependency>
  <groupId>io.github.openviglet</groupId>
  <artifactId>models-catalog-client</artifactId>
  <version>1.0.0</version>
</dependency>
```

Straight from the public GitHub repo — use [JitPack](https://jitpack.io), which builds
public repos on demand and serves them as Maven artifacts with **no login**:

```xml
<repositories>
  <repository>
    <id>jitpack.io</id>
    <url>https://jitpack.io</url>
  </repository>
</repositories>

<dependency>
  <!-- group = com.github.<user>.<repo>; the client lives in a subdirectory, so
       it resolves as a module by its own artifactId -->
  <groupId>com.github.openviglet.models-catalog</groupId>
  <artifactId>models-catalog-client</artifactId>
  <version>java-v1.0.0</version> <!-- any tag, commit SHA, or main-SNAPSHOT -->
</dependency>
```

The repo's [`jitpack.yml`](../../jitpack.yml) tells JitPack to build the `clients/java/`
module and pin it to the requested ref, so the coordinate above resolves for any tag —
no root aggregator pom needed.

> GitHub Packages also hosts Maven, but consuming even a **public** artifact from it
> requires an auth token in `settings.xml`, so it isn't truly public — JitPack is the
> auth-free option.

## Usage

```java
import io.github.openviglet.modelscatalog.*;
import java.util.List;

var catalog = ModelCatalogClient.create();

List<ModelEntry> everything = catalog.all();
List<ModelEntry> embeddings = catalog.byKind(Kind.EMBEDDING);
List<ModelEntry> openai = catalog.byVendor("openai");
catalog.get("openai", "gpt-4o")
       .ifPresent(m -> System.out.println(m.contextWindow()));
```

## Options

```java
ModelCatalogClient.builder()
    .baseUrl("https://models.viglet.org") // default: the public GitHub Pages endpoint
    .ttl(Duration.ofSeconds(60))           // re-fetch after 60s; zero (default) = cache until refresh()
    .pinnedVersion(1)                      // load catalog-v1.json instead of the rolling catalog.json
    .compact(true)                         // load the compact index.json (trimmed entries)
    .timeout(Duration.ofSeconds(30))       // per-request HTTP timeout
    .build();
```

## API

| Method | Returns |
|---|---|
| `load()` | Ensure loaded (fetches only when empty/stale); the `Catalog`. |
| `refresh()` | Force a fresh fetch, replacing the cache. |
| `clear()` | Drop the cache; next access re-fetches. |
| `all()` | `List<ModelEntry>` across every vendor. |
| `byKind(Kind)` / `byKind(String)` | Entries of a kind. |
| `byVendor(String)` | Entries of a vendor (case-insensitive). |
| `get(vendor, id)` | `Optional<ModelEntry>`. |
| `vendors()` | Distinct vendor keys. |
| `fetchByKind(kind)` | Fetch the `by-kind/<KIND>.json` slice directly (smaller payload). |
| `fetchByVendor(vendor)` | Fetch the `by-vendor/<vendor>.json` slice directly. |
| `endpoints()` | The `endpoints.json` discovery manifest (raw map). |

A custom transport (e.g. for tests) can be supplied via `.fetcher(url -> body)`.

## Test

```bash
mvn test
```

## License

Apache-2.0. An open, community project — [openviglet/models-catalog](https://github.com/openviglet/models-catalog).
