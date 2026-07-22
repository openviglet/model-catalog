package io.github.openviglet.modelcatalog;

/**
 * A single cited per-domain benchmark score (Block I), e.g. {@code reasoning} / {@code coding}
 * / {@code math}. {@code source} and {@code lastVerified} are per-domain provenance overrides
 * and fall back to the parent {@link Benchmarks} when {@code null}.
 */
public record BenchmarkScore(
        Double value,
        String source,
        String lastVerified) {
}
