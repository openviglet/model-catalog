package io.github.openviglet.modelcatalog;

/**
 * Optional INDICATIVE US list price for a model (Block F). A reference only — verify with
 * the vendor; never an authoritative, per-contract, per-region or negotiated quote.
 * Provenance-gated ({@code source} + {@code lastVerified}) and never invented. Any field may
 * be {@code null} when the source did not report it.
 */
public record Pricing(
        Double inputPer1M,
        Double outputPer1M,
        String currency,
        String unit,
        Boolean indicative,
        String note,
        String source,
        String lastVerified) {
}
