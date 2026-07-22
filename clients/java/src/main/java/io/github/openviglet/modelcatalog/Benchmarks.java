package io.github.openviglet.modelcatalog;

import java.util.Map;

/**
 * Optional CITED third-party capability numbers for a model (Block I) — a reference to a
 * public, citable leaderboard (e.g. Artificial Analysis / LMArena), NOT our own quality
 * verdict. Provenance-gated ({@code source} + {@code lastVerified}) and never invented; verify
 * at the source. {@code scores} holds optional per-domain figures keyed by domain (recommended:
 * {@code reasoning}, {@code coding}, {@code math}). Any field may be {@code null} when absent.
 */
public record Benchmarks(
        Double intelligenceIndex,
        Double arenaElo,
        Map<String, BenchmarkScore> scores,
        Boolean indicative,
        String note,
        String source,
        String lastVerified) {
}
