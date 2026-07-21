package io.github.openviglet.modelscatalog;

import java.util.List;

/**
 * Supported input/output modalities for a model, when known. Either list may be null
 * if the source did not report it.
 */
public record Modalities(List<String> input, List<String> output) {
}
