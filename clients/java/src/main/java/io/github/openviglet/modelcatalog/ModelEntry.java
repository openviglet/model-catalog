package io.github.openviglet.modelcatalog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A single catalog model entry, mirroring the published {@code ModelEntry} contract.
 * Optional fields are {@code null} when absent. Any keys not in the known schema are
 * preserved in {@link #extra()} so a future additive-schema field never breaks an
 * older client. After flattening, {@link #vendor()} is always populated.
 */
public record ModelEntry(
        String id,
        String label,
        Kind kind,
        String vendor,
        Integer contextWindow,
        Integer embeddingDimensions,
        List<String> capabilities,
        Boolean openWeights,
        Long parameters,
        Boolean deprecated,
        Integer maxOutputTokens,
        Modalities modalities,
        String knowledgeCutoff,
        String releaseDate,
        List<String> aliases,
        String status,
        List<String> sources,
        String lastVerified,
        Pricing pricing,
        Benchmarks benchmarks,
        Performance performance,
        Map<String, Object> extra) {

    private static final Set<String> KNOWN = Set.of(
            "id", "label", "kind", "vendor", "contextWindow", "embeddingDimensions",
            "capabilities", "openWeights", "parameters", "deprecated", "maxOutputTokens",
            "modalities", "knowledgeCutoff", "releaseDate", "aliases", "status", "sources",
            "lastVerified", "pricing", "benchmarks", "performance");

    /** Build an entry from a parsed JSON object, backfilling {@code vendor} from the map key. */
    static ModelEntry fromJson(Map<String, Object> m, String vendorKey) {
        String vendor = str(m.get("vendor"));
        if (vendor == null || vendor.isBlank()) {
            vendor = vendorKey;
        }
        Map<String, Object> extra = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : m.entrySet()) {
            if (!KNOWN.contains(e.getKey())) {
                extra.put(e.getKey(), e.getValue());
            }
        }
        return new ModelEntry(
                str(m.get("id")),
                str(m.get("label")),
                Kind.fromString(str(m.get("kind"))),
                vendor,
                integer(m.get("contextWindow")),
                integer(m.get("embeddingDimensions")),
                strList(m.get("capabilities")),
                bool(m.get("openWeights")),
                lng(m.get("parameters")),
                bool(m.get("deprecated")),
                integer(m.get("maxOutputTokens")),
                modalities(m.get("modalities")),
                str(m.get("knowledgeCutoff")),
                str(m.get("releaseDate")),
                strList(m.get("aliases")),
                str(m.get("status")),
                strList(m.get("sources")),
                str(m.get("lastVerified")),
                pricing(m.get("pricing")),
                benchmarks(m.get("benchmarks")),
                performance(m.get("performance")),
                extra);
    }

    private static String str(Object o) {
        return o instanceof String s ? s : null;
    }

    private static Integer integer(Object o) {
        return o instanceof Number n ? n.intValue() : null;
    }

    private static Long lng(Object o) {
        return o instanceof Number n ? n.longValue() : null;
    }

    private static Double dbl(Object o) {
        return o instanceof Number n ? n.doubleValue() : null;
    }

    private static Boolean bool(Object o) {
        return o instanceof Boolean b ? b : null;
    }

    private static List<String> strList(Object o) {
        if (!(o instanceof List<?> list)) {
            return null;
        }
        List<String> out = new ArrayList<>();
        for (Object x : list) {
            if (x instanceof String s) {
                out.add(s);
            }
        }
        return out;
    }

    private static Modalities modalities(Object o) {
        if (!(o instanceof Map<?, ?> map)) {
            return null;
        }
        return new Modalities(strList(map.get("input")), strList(map.get("output")));
    }

    private static Pricing pricing(Object o) {
        if (!(o instanceof Map<?, ?> m)) {
            return null;
        }
        return new Pricing(
                dbl(m.get("inputPer1M")),
                dbl(m.get("outputPer1M")),
                str(m.get("currency")),
                str(m.get("unit")),
                bool(m.get("indicative")),
                str(m.get("note")),
                str(m.get("source")),
                str(m.get("lastVerified")));
    }

    private static Benchmarks benchmarks(Object o) {
        if (!(o instanceof Map<?, ?> m)) {
            return null;
        }
        Map<String, BenchmarkScore> scores = null;
        if (m.get("scores") instanceof Map<?, ?> sm) {
            scores = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : sm.entrySet()) {
                if (e.getKey() instanceof String key && e.getValue() instanceof Map<?, ?> sv) {
                    scores.put(key, new BenchmarkScore(
                            dbl(sv.get("value")), str(sv.get("source")), str(sv.get("lastVerified"))));
                }
            }
        }
        return new Benchmarks(
                dbl(m.get("intelligenceIndex")),
                dbl(m.get("arenaElo")),
                scores,
                bool(m.get("indicative")),
                str(m.get("note")),
                str(m.get("source")),
                str(m.get("lastVerified")));
    }

    private static Performance performance(Object o) {
        if (!(o instanceof Map<?, ?> m)) {
            return null;
        }
        return new Performance(
                dbl(m.get("throughputTps")),
                dbl(m.get("latencyTtftSec")),
                bool(m.get("indicative")),
                str(m.get("note")),
                str(m.get("source")),
                str(m.get("lastVerified")));
    }
}
