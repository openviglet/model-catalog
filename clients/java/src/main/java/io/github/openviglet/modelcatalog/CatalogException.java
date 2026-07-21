package io.github.openviglet.modelcatalog;

/** Unchecked wrapper for any failure fetching or parsing the catalog. */
public class CatalogException extends RuntimeException {

    public CatalogException(String message) {
        super(message);
    }

    public CatalogException(String message, Throwable cause) {
        super(message, cause);
    }
}
