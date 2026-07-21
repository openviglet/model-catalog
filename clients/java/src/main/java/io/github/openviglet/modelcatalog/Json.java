package io.github.openviglet.modelcatalog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A minimal, dependency-free JSON reader — just enough to parse the catalog envelope
 * (objects, arrays, strings, numbers, booleans, null). Kept intentionally small so
 * the client needs no JSON framework, matching this project's zero-dependency ethos.
 *
 * <p>Objects become {@link LinkedHashMap} (insertion order preserved), arrays become
 * {@link ArrayList}, strings {@link String}, integral numbers {@link Long}, fractional
 * numbers {@link Double}, and {@code true}/{@code false}/{@code null} their obvious
 * Java values.
 */
final class Json {

    private final String s;
    private int i;

    private Json(String s) {
        this.s = s;
    }

    /** Parse the top-level JSON object of a catalog envelope. */
    @SuppressWarnings("unchecked")
    static Map<String, Object> parseObject(String text) {
        Object v = parse(text);
        if (!(v instanceof Map)) {
            throw new IllegalArgumentException("Json: expected a JSON object at top level");
        }
        return (Map<String, Object>) v;
    }

    static Object parse(String text) {
        Json j = new Json(text);
        j.ws();
        Object v = j.value();
        j.ws();
        if (j.i < j.s.length()) {
            throw j.err("trailing characters");
        }
        return v;
    }

    private Object value() {
        char c = peek();
        return switch (c) {
            case '{' -> object();
            case '[' -> array();
            case '"' -> string();
            case 't', 'f' -> bool();
            case 'n' -> nul();
            default -> number();
        };
    }

    private Map<String, Object> object() {
        expect('{');
        Map<String, Object> m = new LinkedHashMap<>();
        ws();
        if (peek() == '}') {
            i++;
            return m;
        }
        while (true) {
            ws();
            String key = string();
            ws();
            expect(':');
            ws();
            m.put(key, value());
            ws();
            char c = next();
            if (c == '}') {
                break;
            }
            if (c != ',') {
                throw err("expected ',' or '}'");
            }
        }
        return m;
    }

    private List<Object> array() {
        expect('[');
        List<Object> a = new ArrayList<>();
        ws();
        if (peek() == ']') {
            i++;
            return a;
        }
        while (true) {
            ws();
            a.add(value());
            ws();
            char c = next();
            if (c == ']') {
                break;
            }
            if (c != ',') {
                throw err("expected ',' or ']'");
            }
        }
        return a;
    }

    private String string() {
        expect('"');
        StringBuilder sb = new StringBuilder();
        while (true) {
            char c = next();
            if (c == '"') {
                break;
            }
            if (c == '\\') {
                char e = next();
                switch (e) {
                    case '"' -> sb.append('"');
                    case '\\' -> sb.append('\\');
                    case '/' -> sb.append('/');
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case 'u' -> {
                        String hex = s.substring(i, i + 4);
                        i += 4;
                        sb.append((char) Integer.parseInt(hex, 16));
                    }
                    default -> throw err("invalid escape \\" + e);
                }
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private Object number() {
        int start = i;
        if (peek() == '-') {
            i++;
        }
        while (i < s.length() && isNumberChar(s.charAt(i))) {
            i++;
        }
        String num = s.substring(start, i);
        if (num.isEmpty()) {
            throw err("invalid number");
        }
        if (num.indexOf('.') >= 0 || num.indexOf('e') >= 0 || num.indexOf('E') >= 0) {
            return Double.parseDouble(num);
        }
        try {
            return Long.parseLong(num);
        } catch (NumberFormatException ex) {
            return Double.parseDouble(num);
        }
    }

    private static boolean isNumberChar(char c) {
        return (c >= '0' && c <= '9') || c == '.' || c == '-' || c == '+' || c == 'e' || c == 'E';
    }

    private Boolean bool() {
        if (s.startsWith("true", i)) {
            i += 4;
            return Boolean.TRUE;
        }
        if (s.startsWith("false", i)) {
            i += 5;
            return Boolean.FALSE;
        }
        throw err("invalid literal");
    }

    private Object nul() {
        if (s.startsWith("null", i)) {
            i += 4;
            return null;
        }
        throw err("invalid literal");
    }

    private void ws() {
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                i++;
            } else {
                break;
            }
        }
    }

    private char peek() {
        if (i >= s.length()) {
            throw err("unexpected end of input");
        }
        return s.charAt(i);
    }

    private char next() {
        if (i >= s.length()) {
            throw err("unexpected end of input");
        }
        return s.charAt(i++);
    }

    private void expect(char c) {
        char got = next();
        if (got != c) {
            throw err("expected '" + c + "' but found '" + got + "'");
        }
    }

    private IllegalArgumentException err(String msg) {
        return new IllegalArgumentException("Json parse error at index " + i + ": " + msg);
    }
}
