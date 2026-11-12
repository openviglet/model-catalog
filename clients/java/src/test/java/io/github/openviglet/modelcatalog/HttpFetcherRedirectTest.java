package io.github.openviglet.modelcatalog;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.sun.net.httpserver.HttpServer;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** T101: the default transport follows a 301, as the old catalog address now answers. */
class HttpFetcherRedirectTest {

    private static final String CATALOG = """
            { "version": 1, "generatedAt": "2026-11-12T00:00:00Z",
              "vendors": { "openai": [ { "id": "gpt-4o", "label": "GPT-4o", "kind": "CHAT" } ] } }
            """;

    private HttpServer server;
    private String base;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/old/", exchange -> {
            String rest = exchange.getRequestURI().getPath().substring("/old".length());
            exchange.getResponseHeaders().add("Location", base + "/new" + rest);
            exchange.sendResponseHeaders(301, -1);
            exchange.close();
        });
        server.createContext("/new/", exchange -> {
            byte[] body = CATALOG.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        base = "http://" + server.getAddress().getHostString() + ":" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void fetcherFollowsMovedPermanently() throws Exception {
        String body = new ModelCatalogClient.HttpFetcher(Duration.ofSeconds(5)).get(base + "/old/catalog.json");
        assertEquals(CATALOG, body);
    }

    @Test
    void clientReadsCatalogThroughTheOldAddress() throws Exception {
        ModelCatalogClient client = ModelCatalogClient.builder().baseUrl(base + "/old").build();
        assertEquals("gpt-4o", client.get("openai", "gpt-4o").orElseThrow().id());
    }
}
