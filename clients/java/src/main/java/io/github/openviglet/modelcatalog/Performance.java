package io.github.openviglet.modelcatalog;

/**
 * Optional CITED speed metrics for a model (Block I) — the "fast vs capable" axis alongside
 * {@link Benchmarks}. A reference to a public measurement, NOT our own benchmark.
 * Provenance-gated ({@code source} + {@code lastVerified}) and never invented; verify at the
 * source. Any field may be {@code null} when the source did not report it.
 */
public record Performance(
        Double throughputTps,
        Double latencyTtftSec,
        Boolean indicative,
        String note,
        String source,
        String lastVerified) {
}
