package io.github.openviglet.modelcatalog;

import java.util.Locale;

/**
 * The published model-kind taxonomy. Parsing is lenient: an unrecognized value maps
 * to {@link #UNKNOWN} rather than throwing, so a future schema addition never breaks
 * an older client.
 */
public enum Kind {
    CHAT,
    EMBEDDING,
    RERANK,
    IMAGE,
    TRANSCRIPTION,
    SPEECH,
    VIDEO,
    MODERATION,
    UNKNOWN;

    /** Map a raw string to a Kind (case-insensitive); unknown/blank -> {@link #UNKNOWN}. */
    public static Kind fromString(String value) {
        if (value == null || value.isBlank()) {
            return UNKNOWN;
        }
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return UNKNOWN;
        }
    }
}
