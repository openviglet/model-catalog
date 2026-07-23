import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContextTxt, buildQueryManifest, flattenRecord } from "./query-manifest.mjs";

const SAMPLE = [
  {
    id: "claude-fable-5",
    label: "Claude Fable 5",
    kind: "CHAT",
    vendor: "anthropic",
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    capabilities: ["tools", "vision", "reasoning"],
    modalities: { input: ["image", "pdf", "text"] },
    releaseDate: "2026-06-07",
    pricing: { inputPer1M: 10, outputPer1M: 50, currency: "USD", unit: "per_1M_tokens",
      indicative: true, note: "verify", source: "litellm", lastVerified: "2026-07-22" },
    benchmarks: { intelligenceIndex: 59.9, scores: { coding: { value: 76.5 } } },
    sources: ["anthropic-api", "litellm"],
    lastVerified: "2026-07-22",
  },
  {
    id: "text-embedding-3-small",
    label: "Text Embedding 3 Small",
    kind: "EMBEDDING",
    vendor: "openai",
    contextWindow: 8191,
    capabilities: [],
    pricing: { inputPer1M: 0.02, currency: "USD", indicative: true },
  },
];

test("flattenRecord expands nested objects and drops noise-free scalars", () => {
  const f = flattenRecord(SAMPLE[0]);
  assert.equal(f.pricing_inputPer1M, 10);
  assert.equal(f.benchmarks_intelligenceIndex, 59.9);
  assert.equal(f.benchmarks_scores_coding_value, 76.5);
  assert.deepEqual(f.modalities_input, ["image", "pdf", "text"]);
  assert.equal(f.pricing, undefined); // raw nested object never kept
});

test("buildQueryManifest infers types, enums and numeric ranges", () => {
  const m = buildQueryManifest(SAMPLE, { source: "https://x", schemaVersion: "1", generatedAt: "2026-07-22" });
  assert.equal(m.recordCount, 2);
  assert.equal(m.idField, "id");
  const byName = Object.fromEntries(m.fields.map((f) => [f.name, f]));

  // id is excluded (it is the identifier, not a query field)
  assert.equal(byName.id, undefined);
  // provenance noise excluded
  assert.equal(byName.pricing_note, undefined);
  assert.equal(byName.pricing_source, undefined);
  assert.equal(byName.pricing_indicative, undefined);
  assert.equal(byName.sources, undefined);
  assert.equal(byName.lastVerified, undefined);

  // kind → faceted STRING enum
  assert.equal(byName.kind.type, "STRING");
  assert.equal(byName.kind.facet, true);
  assert.deepEqual(byName.kind.enum, ["CHAT", "EMBEDDING"]);

  // vendor → faceted enum
  assert.deepEqual(byName.vendor.enum, ["anthropic", "openai"]);

  // contextWindow → INT with min/max
  assert.equal(byName.contextWindow.type, "INT");
  assert.equal(byName.contextWindow.facet, false);
  assert.equal(byName.contextWindow.sortable, true);
  assert.equal(byName.contextWindow.min, 8191);
  assert.equal(byName.contextWindow.max, 1000000);

  // pricing flattened + DOUBLE (0.02 is non-integer)
  assert.equal(byName.pricing_inputPer1M.type, "DOUBLE");
  assert.equal(byName.pricing_inputPer1M.min, 0.02);

  // capabilities → multi-valued faceted STRING
  assert.equal(byName.capabilities.multiValued, true);
  assert.equal(byName.capabilities.facet, true);
  assert.ok(byName.capabilities.enum.includes("tools"));

  // modalities flattened + multi-valued
  assert.equal(byName.modalities_input.multiValued, true);

  // label → full-text, not faceted
  assert.equal(byName.label.type, "TEXT");
  assert.equal(byName.label.facet, false);
});

test("buildContextTxt yields one decision line per model with a caveat header", () => {
  const txt = buildContextTxt(SAMPLE, { source: "https://x", lastUpdated: "2026-07-22" });
  const lines = txt.trim().split("\n");
  assert.ok(lines[0].startsWith("# Model Catalog"));
  assert.ok(txt.includes("INDICATIVE"));
  const body = lines.filter((l) => l.startsWith("- "));
  assert.equal(body.length, 2);
  // sorted by vendor: anthropic before openai
  assert.ok(body[0].includes("claude-fable-5 [anthropic/CHAT]"));
  assert.ok(body[0].includes("ctx=1000000"));
  assert.ok(body[0].includes("in$=10 out$=50"));
  assert.ok(body[0].includes("II=59.9"));
  assert.ok(body[0].includes("caps=tools,vision,reasoning"));
  assert.ok(body[1].includes("text-embedding-3-small [openai/EMBEDDING]"));
});
