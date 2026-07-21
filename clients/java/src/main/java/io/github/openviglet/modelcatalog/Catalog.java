package io.github.openviglet.modelcatalog;

import java.util.List;

/**
 * A loaded catalog envelope: its version/metadata plus the flattened list of entries
 * (each carrying its {@code vendor}). Returned by {@link ModelCatalogClient#load()}
 * and {@link ModelCatalogClient#refresh()}.
 */
public record Catalog(int version, String lastUpdated, String source, List<ModelEntry> entries) {
}
