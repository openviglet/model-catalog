/**
 * Unit tests for the model-catalog regeneration pipeline (Block BD). Zero-dep,
 * offline — exercises the pure merge/validate/normalize units with inline
 * fixtures (no network, no filesystem). Run: `node --test scripts/catalog`.
 *
 * @since 2026.3.4 (T770)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { merge } from "./lib/merge.mjs";
import { validateEnvelope, diffReport } from "./lib/validate.mjs";
import litellm from "./adapters/litellm.mjs";
import benchmarks from "./adapters/benchmarks.mjs";
import artificialAnalysis from "./adapters/artificial-analysis.mjs";
import ollama from "./adapters/ollama.mjs";
import bedrock from "./adapters/bedrock.mjs";
import huggingface from "./adapters/huggingface.mjs";

const WHEN = "2026-07-21";
const ANCHORS = new Set(["openai-api", "anthropic-api", "gemini-api", "cohere-api", "mistral-api", "overrides"]);

function baseMerge(over = {}) {
  return merge({
    sources: [],
    overrides: [],
    existing: { version: 1, vendors: {} },
    anchoringSources: ANCHORS,
    liveIdsByVendor: new Map(),
    when: WHEN,
    ...over,
  });
}

test("litellm normalize: maps mode→kind, strips prefix, maps pricing + drops wildcards", () => {
  const drafts = litellm.normalize({
    sample_spec: { note: "ignore" },
    "gpt-4.1": { litellm_provider: "openai", mode: "chat", max_input_tokens: 1000, max_output_tokens: 200, supports_vision: true, input_cost_per_token: 0.000002, output_cost_per_token: 0.000008 },
    "anthropic/claude-x": { litellm_provider: "anthropic", mode: "chat", max_input_tokens: 200000 },
    "embed-y": { litellm_provider: "cohere", mode: "embedding", output_vector_size: 1024 },
    "omni-moderation": { litellm_provider: "openai", mode: "moderation", max_input_tokens: 32768, max_output_tokens: 0 },
    "openai/gpt-4o-*": { litellm_provider: "openai", mode: "chat" },
    "unknown-vendor-model": { litellm_provider: "someone-else", mode: "chat" },
  });
  const byId = Object.fromEntries(drafts.map((d) => [`${d.vendor}/${d.id}`, d]));
  assert.equal(drafts.length, 4, "sample_spec + wildcard + untracked vendor dropped");
  assert.equal(byId["openai/omni-moderation"].maxOutputTokens, undefined, "non-positive max_output_tokens omitted, not emitted as invalid 0");
  assert.equal(byId["openai/omni-moderation"].contextWindow, 32768);
  assert.equal(byId["openai/gpt-4.1"].kind, "CHAT");
  assert.equal(byId["openai/gpt-4.1"].maxOutputTokens, 200);
  assert.ok(byId["openai/gpt-4.1"].capabilities.includes("vision"));
  // Pricing: per-token USD → per-1M USD, flagged indicative + provenance-stamped (T31).
  assert.equal(byId["openai/gpt-4.1"].input_cost_per_token, undefined, "raw cost key not leaked");
  assert.deepEqual(byId["openai/gpt-4.1"].pricing, {
    inputPer1M: 2, outputPer1M: 8, currency: "USD", unit: "per_1M_tokens",
    indicative: true, note: "Indicative US list price — verify with the vendor.", source: "litellm",
  });
  assert.equal(byId["cohere/embed-y"].pricing, undefined, "no cost keys → no invented price");
  assert.equal(byId["anthropic/claude-x"].id, "claude-x", "provider/ prefix stripped");
  assert.equal(byId["cohere/embed-y"].kind, "EMBEDDING");
  assert.equal(byId["cohere/embed-y"].embeddingDimensions, 1024);
});

test("litellm normalize: onboarded providers (Block H / T36) map to their catalog vendors", () => {
  const drafts = litellm.normalize({
    "groq/llama-3.3-70b-versatile": { litellm_provider: "groq", mode: "chat", input_cost_per_token: 0.00000059 },
    "together_ai/deepseek-ai/DeepSeek-V3": { litellm_provider: "together_ai", mode: "chat" },
    "fireworks_ai/accounts/fireworks/models/glm-4p6": { litellm_provider: "fireworks_ai", mode: "chat" },
    "cerebras/llama-3.3-70b": { litellm_provider: "cerebras", mode: "chat" },
    "dashscope/qwen-max": { litellm_provider: "dashscope", mode: "chat" },
    "azure/gpt-4o": { litellm_provider: "azure", mode: "chat" },
  });
  const byId = Object.fromEntries(drafts.map((d) => [d.id, d]));
  assert.equal(byId["llama-3.3-70b-versatile"].vendor, "groq");
  assert.equal(byId["deepseek-ai/DeepSeek-V3"].vendor, "together", "together_ai → together, org-prefixed id preserved");
  assert.equal(byId["accounts/fireworks/models/glm-4p6"].vendor, "fireworks", "fireworks_ai → fireworks, full account path preserved");
  assert.equal(byId["llama-3.3-70b"].vendor, "cerebras");
  assert.equal(byId["qwen-max"].vendor, "qwen", "dashscope → qwen");
  assert.equal(byId["gpt-4o"].vendor, "azure");
  assert.ok(byId["llama-3.3-70b-versatile"].pricing.inputPer1M > 0, "pricing mapped for an onboarded provider");
});

test("ollama normalize: uses ref as id, heuristic kind, is a partial anchor", () => {
  assert.equal(ollama.vendor, "ollama");
  assert.equal(ollama.partial, true, "local pulls are not removal evidence");
  const drafts = ollama.normalize({
    models: [
      { name: "llama3:8b", model: "llama3:8b" },
      { name: "nomic-embed-text:latest", model: "nomic-embed-text:latest" },
      { model: "" }, // dropped: empty ref
      {}, // dropped: no ref
    ],
  });
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts[0], { vendor: "ollama", id: "llama3:8b", kind: "CHAT" });
  assert.equal(drafts[1].kind, "EMBEDDING", "embed in the name → EMBEDDING");
  assert.equal(drafts[0].label, undefined, "no guessed label");
});

test("huggingface normalize: maps pipeline_tag→kind, defaults to EMBEDDING, partial anchor", () => {
  assert.equal(huggingface.vendor, "huggingface");
  assert.equal(huggingface.partial, true);
  const drafts = huggingface.normalize([
    { id: "sentence-transformers/all-MiniLM-L6-v2", pipeline_tag: "sentence-similarity" },
    { modelId: "some/generator", pipeline_tag: "text-generation" },
    { id: "sentence-transformers/no-tag" }, // no tag → EMBEDDING default
    { pipeline_tag: "feature-extraction" }, // dropped: no id
  ]);
  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].kind, "EMBEDDING");
  assert.equal(drafts[1].kind, "CHAT");
  assert.equal(drafts[2].kind, "EMBEDDING", "sentence-transformers without a tag → EMBEDDING");
  assert.equal(drafts[0].vendor, "huggingface");
});

test("bedrock normalize: maps modalities→kind, keeps modelName label + status, partial anchor", () => {
  assert.equal(bedrock.vendor, "bedrock");
  assert.equal(bedrock.partial, true, "region-scoped listing is not removal evidence");
  const drafts = bedrock.normalize({
    modelSummaries: [
      {
        modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        modelName: "Claude 3.5 Sonnet",
        inputModalities: ["TEXT", "IMAGE"],
        outputModalities: ["TEXT"],
        modelLifecycle: { status: "ACTIVE" },
      },
      {
        modelId: "amazon.titan-embed-text-v2:0",
        modelName: "Titan Text Embeddings V2",
        inputModalities: ["TEXT"],
        outputModalities: ["EMBEDDING"],
        modelLifecycle: { status: "LEGACY" },
      },
      { notAModel: true }, // dropped: no modelId
    ],
  });
  assert.equal(drafts.length, 2);
  const chat = drafts[0];
  assert.equal(chat.kind, "CHAT");
  assert.equal(chat.label, "Claude 3.5 Sonnet", "modelName is a genuine label");
  assert.equal(chat.status, "GA");
  assert.deepEqual(chat.modalities, { input: ["text", "image"], output: ["text"] });
  const embed = drafts[1];
  assert.equal(embed.kind, "EMBEDDING", "EMBEDDING output → EMBEDDING kind");
  assert.equal(embed.status, "DEPRECATED", "LEGACY → DEPRECATED");
});

test("merge carry-forward: committed entries survive a run that never fetched them", () => {
  const existing = { version: 1, vendors: { anthropic: [{ id: "claude-x", label: "Claude X", kind: "CHAT", contextWindow: 200000 }] } };
  const { vendors } = baseMerge({ existing });
  assert.equal(vendors.anthropic.length, 1);
  assert.deepEqual(vendors.anthropic[0].label, "Claude X");
  assert.deepEqual(vendors.anthropic[0].sources, ["committed"]);
});

test("merge anchoring: a litellm-only new id is skipped, not admitted", () => {
  const { vendors, skipped } = baseMerge({
    sources: [{ sourceId: "litellm", drafts: [{ vendor: "openai", id: "ghost-model", kind: "CHAT" }] }],
  });
  assert.equal(vendors.openai, undefined);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].id, "ghost-model");
});

test("merge enrichment: litellm fills a field the committed entry lacks", () => {
  const existing = { version: 1, vendors: { openai: [{ id: "gpt-4.1", label: "GPT-4.1", kind: "CHAT" }] } };
  const { vendors, meta } = baseMerge({
    existing,
    sources: [{ sourceId: "litellm", drafts: [{ vendor: "openai", id: "gpt-4.1", kind: "CHAT", contextWindow: 1000000, maxOutputTokens: 32768 }] }],
  });
  const e = vendors.openai[0];
  assert.equal(e.label, "GPT-4.1", "curated label preserved");
  assert.equal(e.contextWindow, 1000000);
  assert.equal(e.maxOutputTokens, 32768);
  assert.equal(meta["openai::gpt-4.1"].fieldProvenance.maxOutputTokens, "litellm");
});

test("merge pricing: litellm fills a blank price, committed then stays stable, pin corrects (T31)", () => {
  const priced = (over) => ({ currency: "USD", unit: "per_1M_tokens", indicative: true, source: "litellm", ...over });

  // (a) enrich a blank price; merge stamps lastVerified when the source omits it.
  let m = baseMerge({
    existing: { version: 1, vendors: { openai: [{ id: "gpt", label: "GPT", kind: "CHAT" }] } },
    sources: [{ sourceId: "litellm", drafts: [{ vendor: "openai", id: "gpt", kind: "CHAT", pricing: priced({ inputPer1M: 2, outputPer1M: 8 }) }] }],
  });
  let e = m.vendors.openai[0];
  assert.equal(e.pricing.inputPer1M, 2);
  assert.equal(e.pricing.lastVerified, WHEN, "merge stamps lastVerified when the source omits it");
  assert.equal(m.meta["openai::gpt"].fieldProvenance.pricing, "litellm");

  // (b) stability: a committed price beats a differing litellm price (no per-run flapping).
  const committedPrice = priced({ inputPer1M: 2, lastVerified: "2026-01-01" });
  m = baseMerge({
    existing: { version: 1, vendors: { openai: [{ id: "gpt", label: "GPT", kind: "CHAT", pricing: committedPrice }] } },
    sources: [{ sourceId: "litellm", drafts: [{ vendor: "openai", id: "gpt", kind: "CHAT", pricing: priced({ inputPer1M: 99 }) }] }],
  });
  e = m.vendors.openai[0];
  assert.equal(e.pricing.inputPer1M, 2, "committed price wins over litellm (stable, low-churn)");
  assert.equal(e.pricing.lastVerified, "2026-01-01", "carried-forward price keeps its own lastVerified");

  // (c) a pinned override corrects the price over both committed and litellm.
  m = baseMerge({
    existing: { version: 1, vendors: { openai: [{ id: "gpt", label: "GPT", kind: "CHAT", pricing: committedPrice }] } },
    sources: [{ sourceId: "litellm", drafts: [{ vendor: "openai", id: "gpt", kind: "CHAT", pricing: priced({ inputPer1M: 99 }) }] }],
    overrides: [{ vendor: "openai", id: "gpt", pricing: priced({ inputPer1M: 12.5, source: "vendor pricing page" }), __pin: true }],
  });
  e = m.vendors.openai[0];
  assert.equal(e.pricing.inputPer1M, 12.5, "pinned override price wins");
  assert.equal(e.pricing.source, "vendor pricing page");
});

test("merge precedence: live vendor API beats litellm; conflict is flagged", () => {
  const existing = { version: 1, vendors: { gemini: [{ id: "g", label: "G", kind: "CHAT" }] } };
  const { vendors, meta } = baseMerge({
    existing,
    sources: [
      { sourceId: "gemini-api", drafts: [{ vendor: "gemini", id: "g", kind: "CHAT", contextWindow: 2000000 }] },
      { sourceId: "litellm", drafts: [{ vendor: "gemini", id: "g", kind: "CHAT", contextWindow: 1000000 }] },
    ],
  });
  assert.equal(vendors.gemini[0].contextWindow, 2000000, "live API wins");
  const conflicts = meta["gemini::g"].conflicts;
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].field, "contextWindow");
  assert.equal(conflicts[0].winner.source, "gemini-api");
});

test("merge pin: __pin override beats even the live vendor API", () => {
  const existing = { version: 1, vendors: { openai: [{ id: "e", label: "E", kind: "EMBEDDING" }] } };
  const { vendors } = baseMerge({
    existing,
    sources: [{ sourceId: "openai-api", drafts: [{ vendor: "openai", id: "e", kind: "EMBEDDING", embeddingDimensions: 999 }] }],
    overrides: [{ vendor: "openai", id: "e", embeddingDimensions: 1536, __pin: true }],
  });
  assert.equal(vendors.openai[0].embeddingDimensions, 1536);
});

test("merge positive-evidence removal: live API omitting an id drops it (unless pinned)", () => {
  const existing = { version: 1, vendors: { openai: [
    { id: "kept", label: "Kept", kind: "CHAT" },
    { id: "gone", label: "Gone", kind: "CHAT" },
    { id: "pinned", label: "Pinned", kind: "CHAT" },
  ] } };
  const { vendors, removed } = baseMerge({
    existing,
    sources: [{ sourceId: "openai-api", drafts: [{ vendor: "openai", id: "kept", kind: "CHAT" }] }],
    overrides: [{ vendor: "openai", id: "pinned", kind: "CHAT" }],
    liveIdsByVendor: new Map([["openai", new Set(["kept"])]]),
  });
  const ids = vendors.openai.map((e) => e.id).sort();
  assert.deepEqual(ids, ["kept", "pinned"], "kept + override-protected survive; gone removed");
  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, "gone");
});

test("validateEnvelope: flags bad kind, duplicate id, invalid numeric", () => {
  const errs = validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [
    { id: "a", label: "A", kind: "NOPE" },
    { id: "b", label: "B", kind: "CHAT", contextWindow: 0 },
    { id: "b", label: "B2", kind: "CHAT" },
  ] } });
  assert.ok(errs.some((e) => /invalid kind/.test(e)));
  assert.ok(errs.some((e) => /invalid contextWindow/.test(e)));
  assert.ok(errs.some((e) => /duplicate id/.test(e)));
});

test("validateEnvelope: a clean envelope passes", () => {
  const errs = validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [{ id: "a", label: "A", kind: "CHAT", status: "GA" }] } });
  assert.deepEqual(errs, []);
});

test("validateEnvelope: a provenance-gated indicative price passes (Block F / T30)", () => {
  const errs = validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [
    { id: "a", label: "A", kind: "CHAT", pricing: { inputPer1M: 2.5, outputPer1M: 10, currency: "USD", unit: "per_1M_tokens", indicative: true, source: "litellm", lastVerified: WHEN } },
  ] } });
  assert.deepEqual(errs, []);
});

test("validateEnvelope: flags pricing without provenance / non-indicative / bad figures", () => {
  const errs = validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [
    { id: "a", label: "A", kind: "CHAT", pricing: { inputPer1M: -1, indicative: false, currency: "EUR" } },
  ] } });
  assert.ok(errs.some((e) => /pricing.indicative must be true/.test(e)));
  assert.ok(errs.some((e) => /pricing missing string source/.test(e)));
  assert.ok(errs.some((e) => /pricing missing string lastVerified/.test(e)));
  assert.ok(errs.some((e) => /invalid pricing.inputPer1M/.test(e)));
  assert.ok(errs.some((e) => /pricing.currency must be USD/.test(e)));
});

test("validateEnvelope: openWeights + parameters — valid facts pass, bad ones flagged (Block I / T39)", () => {
  assert.deepEqual(
    validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { deepseek: [
      { id: "v3", label: "DeepSeek-V3", kind: "CHAT", openWeights: true, parameters: 671000000000 },
      { id: "closed", label: "Closed", kind: "CHAT", openWeights: false },
    ] } }),
    [],
    "boolean openWeights + positive-integer parameters are valid",
  );
  const errs = validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [
    { id: "a", label: "A", kind: "CHAT", openWeights: "yes", parameters: 0 },
  ] } });
  assert.ok(errs.some((e) => /openWeights must be boolean/.test(e)));
  assert.ok(errs.some((e) => /invalid parameters/.test(e)));
});

test("merge: overrides seed openWeights + parameters, carried onto the entry (Block I / T39)", () => {
  const { vendors, meta } = baseMerge({
    existing: { version: 1, vendors: { deepseek: [{ id: "v3", label: "DeepSeek-V3", kind: "CHAT" }] } },
    overrides: [{ vendor: "deepseek", id: "v3", openWeights: true, parameters: 671000000000 }],
  });
  const e = vendors.deepseek[0];
  assert.equal(e.openWeights, true);
  assert.equal(e.parameters, 671000000000);
  assert.equal(meta["deepseek::v3"].fieldProvenance.openWeights, "overrides");
  assert.equal(meta["deepseek::v3"].fieldProvenance.parameters, "overrides");
});

test("validateEnvelope: a provenance-gated cited benchmark passes; bad ones flagged (Block I / T40)", () => {
  assert.deepEqual(
    validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [
      { id: "a", label: "A", kind: "CHAT", benchmarks: { intelligenceIndex: 60, arenaElo: 1300, indicative: true, source: "Artificial Analysis", lastVerified: WHEN } },
    ] } }),
    [],
    "cited index with indicative + source + lastVerified is valid",
  );
  const errs = validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [
    { id: "a", label: "A", kind: "CHAT", benchmarks: { intelligenceIndex: -5, indicative: false } },
  ] } });
  assert.ok(errs.some((e) => /benchmarks.indicative must be true/.test(e)));
  assert.ok(errs.some((e) => /benchmarks missing string source/.test(e)));
  assert.ok(errs.some((e) => /benchmarks missing string lastVerified/.test(e)));
  assert.ok(errs.some((e) => /invalid benchmarks.intelligenceIndex/.test(e)));
});

test("merge benchmarks: highest-wins object, lastVerified stamped, committed then stable (Block I / T40)", () => {
  const bench = (over) => ({ indicative: true, source: "Artificial Analysis", ...over });
  // enrich a blank benchmark; merge stamps lastVerified when the source omits it.
  let m = baseMerge({
    existing: { version: 1, vendors: { openai: [{ id: "gpt", label: "GPT", kind: "CHAT" }] } },
    sources: [{ sourceId: "overrides", drafts: [{ vendor: "openai", id: "gpt", kind: "CHAT", benchmarks: bench({ intelligenceIndex: 60 }) }] }],
    anchoringSources: ANCHORS,
  });
  let e = m.vendors.openai[0];
  assert.equal(e.benchmarks.intelligenceIndex, 60);
  assert.equal(e.benchmarks.lastVerified, WHEN, "merge stamps lastVerified when the source omits it");
  assert.equal(m.meta["openai::gpt"].fieldProvenance.benchmarks, "overrides");
  // committed benchmark beats a differing lower-priority source (stable, low-churn).
  m = baseMerge({
    existing: { version: 1, vendors: { openai: [{ id: "gpt", label: "GPT", kind: "CHAT", benchmarks: bench({ intelligenceIndex: 60, lastVerified: "2026-01-01" }) }] } },
    sources: [{ sourceId: "litellm", drafts: [{ vendor: "openai", id: "gpt", kind: "CHAT", benchmarks: bench({ intelligenceIndex: 99, source: "litellm" }) }] }],
  });
  e = m.vendors.openai[0];
  assert.equal(e.benchmarks.intelligenceIndex, 60, "committed benchmark wins over a lower-priority source");
  assert.equal(e.benchmarks.lastVerified, "2026-01-01", "carried-forward benchmark keeps its own lastVerified");
});

test("benchmarks normalize: maps snapshot → cited drafts, stamps provenance, drops junk (Block I / T41)", () => {
  assert.equal(benchmarks.vendor, null, "multi-vendor enrichment — never introduces an id");
  assert.equal(benchmarks.envKey, null, "curated local snapshot, no auth");
  const drafts = benchmarks.normalize({
    source: "Artificial Analysis",
    lastVerified: "2026-07-22",
    models: [
      { vendor: "openai", id: "gpt-5", intelligenceIndex: 69 },
      { vendor: "deepseek", id: "deepseek-reasoner", arenaElo: 1400, source: "LMArena", lastVerified: "2026-07-01" },
      { vendor: "x", id: "no-source", intelligenceIndex: 10, source: "" }, // dropped: falls back to top source ✓ (kept)
      { vendor: "y", id: "no-numbers" }, // dropped: nothing to say
      { id: "no-vendor", intelligenceIndex: 5 }, // dropped: no vendor
    ],
  });
  const byId = Object.fromEntries(drafts.map((d) => [`${d.vendor}/${d.id}`, d]));
  assert.equal(drafts.length, 3, "no-numbers + no-vendor dropped; empty per-model source falls back to top-level");
  assert.deepEqual(byId["openai/gpt-5"].benchmarks, {
    intelligenceIndex: 69, indicative: true,
    note: "Cited third-party benchmark — verify at the source.",
    source: "Artificial Analysis", lastVerified: "2026-07-22",
  });
  assert.equal(byId["deepseek/deepseek-reasoner"].benchmarks.source, "LMArena", "per-model source overrides top-level");
  assert.equal(byId["deepseek/deepseek-reasoner"].benchmarks.lastVerified, "2026-07-01");
  assert.equal(byId["deepseek/deepseek-reasoner"].benchmarks.intelligenceIndex, undefined);
});

test("benchmarks normalize: an un-sourced snapshot entry is dropped (never invented)", () => {
  const drafts = benchmarks.normalize({ models: [{ vendor: "openai", id: "x", intelligenceIndex: 50 }] });
  assert.equal(drafts.length, 0, "no top-level or per-model source → omitted");
});

test("validateEnvelope: per-domain benchmark scores — valid map passes, bad value flagged (Block I / T42)", () => {
  assert.deepEqual(
    validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [
      { id: "a", label: "A", kind: "CHAT", benchmarks: { intelligenceIndex: 69, indicative: true, source: "Artificial Analysis", lastVerified: WHEN, scores: { reasoning: { value: 71 }, coding: { value: 68, source: "SWE-bench", lastVerified: WHEN } } } },
    ] } }),
    [],
    "a scores map of { value, source?, lastVerified? } is valid",
  );
  const errs = validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [
    { id: "a", label: "A", kind: "CHAT", benchmarks: { indicative: true, source: "AA", lastVerified: WHEN, scores: { math: { value: -3 }, coding: 55 } } },
  ] } });
  assert.ok(errs.some((e) => /invalid benchmarks.scores.math.value/.test(e)));
  assert.ok(errs.some((e) => /benchmarks.scores.coding is not an object/.test(e)));
});

test("benchmarks normalize: per-domain scores accept a number or an object (Block I / T42)", () => {
  const [d] = benchmarks.normalize({
    source: "Artificial Analysis", lastVerified: "2026-07-22",
    models: [{ vendor: "openai", id: "gpt-5", scores: { reasoning: 71, coding: { value: 68, source: "SWE-bench", lastVerified: "2026-07-01" }, bogus: "x" } }],
  });
  assert.deepEqual(d.benchmarks.scores.reasoning, { value: 71 }, "plain number → { value } citing the parent source");
  assert.deepEqual(d.benchmarks.scores.coding, { value: 68, source: "SWE-bench", lastVerified: "2026-07-01" }, "object keeps its own provenance");
  assert.equal(d.benchmarks.scores.bogus, undefined, "non-numeric score dropped, never invented");
  assert.equal(d.benchmarks.intelligenceIndex, undefined, "a model with only scores still emits (scores are enough)");
});

test("merge benchmarks source: enriches an existing id, drops one not in the catalog (fail safe, Block I / T41)", () => {
  const { vendors, skipped, meta } = merge({
    sources: [{ sourceId: "benchmarks", drafts: [
      { vendor: "openai", id: "gpt", benchmarks: { intelligenceIndex: 69, indicative: true, source: "Artificial Analysis", lastVerified: WHEN } },
      { vendor: "openai", id: "not-in-catalog", benchmarks: { intelligenceIndex: 42, indicative: true, source: "Artificial Analysis", lastVerified: WHEN } },
    ] }],
    overrides: [],
    existing: { version: 1, vendors: { openai: [{ id: "gpt", label: "GPT", kind: "CHAT" }] } },
    anchoringSources: ANCHORS, // note: "benchmarks" is NOT an anchoring source
    liveIdsByVendor: new Map(),
    when: WHEN,
  });
  assert.equal(vendors.openai.length, 1, "only the pre-existing id survives");
  assert.equal(vendors.openai[0].benchmarks.intelligenceIndex, 69, "existing id enriched with the cited number");
  assert.equal(meta["openai::gpt"].fieldProvenance.benchmarks, "benchmarks");
  assert.ok(skipped.some((s) => s.id === "not-in-catalog"), "a leaderboard model absent from the catalog is dropped, never introduced");
});

test("artificial-analysis: live feed → cited drafts, only mapped slugs, unmapped dropped (Block J / T45)", () => {
  assert.equal(artificialAnalysis.vendor, null, "multi-vendor enrichment — never introduces an id");
  assert.equal(artificialAnalysis.envKey, "ARTIFICIAL_ANALYSIS_API_KEY", "opt-in: online only with a key");
  const drafts = artificialAnalysis.normalize({
    items: [
      {
        slug: "gpt-5",
        evaluations: { artificial_analysis_intelligence_index: 69, artificial_analysis_coding_index: 68, artificial_analysis_math_index: 74 },
        median_output_tokens_per_second: 180,
        median_time_to_first_token_seconds: 0.4,
      },
      { slug: "unmapped-model", evaluations: { artificial_analysis_intelligence_index: 55 } }, // dropped: not in the map
      { slug: "speed-only", median_output_tokens_per_second: 500 },
    ],
    map: {
      "gpt-5": { vendor: "openai", id: "gpt-5" },
      "speed-only": { vendor: "x", id: "fast" },
    },
  });
  const byId = Object.fromEntries(drafts.map((d) => [`${d.vendor}/${d.id}`, d]));
  assert.equal(drafts.length, 2, "the unmapped leaderboard model is dropped (fail safe), never mis-attributed");
  assert.deepEqual(byId["openai/gpt-5"].benchmarks, {
    intelligenceIndex: 69,
    scores: { coding: { value: 68 }, math: { value: 74 } },
    indicative: true,
    note: "Cited third-party benchmark — verify at the source.",
    source: "Artificial Analysis",
  }, "AA evals → intelligenceIndex + per-domain scores, provenance-stamped; lastVerified left for merge");
  assert.deepEqual(byId["openai/gpt-5"].performance, {
    throughputTps: 180, latencyTtftSec: 0.4, indicative: true,
    note: "Cited third-party benchmark — verify at the source.", source: "Artificial Analysis",
  });
  assert.equal(byId["x/fast"].benchmarks, undefined, "speed-only entry emits performance but no benchmarks");
  assert.equal(byId["x/fast"].performance.throughputTps, 500);
});

test("artificial-analysis: empty map or no items emits nothing (Block J / T45)", () => {
  assert.deepEqual(artificialAnalysis.normalize({ items: [{ slug: "gpt-5", evaluations: { artificial_analysis_intelligence_index: 69 } }], map: {} }), [], "empty matching table → nothing (curated opt-in)");
  assert.deepEqual(artificialAnalysis.normalize({ items: [], map: { "gpt-5": { vendor: "openai", id: "gpt-5" } } }), [], "no feed items → nothing");
  assert.deepEqual(artificialAnalysis.normalize(null), [], "no raw → nothing");
});

test("artificial-analysis: the live source enriches the same benchmarks field and wins over the curated snapshot (Block J / T45)", () => {
  // Both the live AA source and the T41 snapshot supply a benchmark for the same id;
  // the live source (priority 26) wins over the curated snapshot (25). Both are
  // non-anchoring, so a model not already in the catalog is still dropped.
  const cited = (over) => ({ indicative: true, note: "Cited third-party benchmark — verify at the source.", source: "Artificial Analysis", ...over });
  const { vendors, meta, skipped } = merge({
    sources: [
      { sourceId: "artificial-analysis", drafts: [
        { vendor: "openai", id: "gpt", benchmarks: cited({ intelligenceIndex: 71 }) },
        { vendor: "openai", id: "ghost", benchmarks: cited({ intelligenceIndex: 40 }) },
      ] },
      { sourceId: "benchmarks", drafts: [{ vendor: "openai", id: "gpt", benchmarks: cited({ intelligenceIndex: 60, lastVerified: "2026-01-01" }) }] },
    ],
    overrides: [],
    existing: { version: 1, vendors: { openai: [{ id: "gpt", label: "GPT", kind: "CHAT" }] } },
    anchoringSources: ANCHORS, // neither benchmark source anchors
    liveIdsByVendor: new Map(),
    when: WHEN,
  });
  assert.equal(vendors.openai.length, 1, "only the pre-existing id survives; the live-only 'ghost' is dropped");
  assert.equal(vendors.openai[0].benchmarks.intelligenceIndex, 71, "live AA (26) wins over the curated snapshot (25)");
  assert.equal(vendors.openai[0].benchmarks.lastVerified, WHEN, "live figure stamped with the run/verify date");
  assert.equal(meta["openai::gpt"].fieldProvenance.benchmarks, "artificial-analysis");
  assert.ok(skipped.some((s) => s.id === "ghost"), "a leaderboard model absent from the catalog is never introduced");
});

test("validateEnvelope: cited performance metrics — valid passes, bad ones flagged (Block I / T43)", () => {
  assert.deepEqual(
    validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [
      { id: "a", label: "A", kind: "CHAT", performance: { throughputTps: 180, latencyTtftSec: 0.4, indicative: true, source: "Artificial Analysis", lastVerified: WHEN } },
    ] } }),
    [],
    "cited throughput + latency with provenance is valid",
  );
  const errs = validateEnvelope({ version: 1, lastUpdated: WHEN, vendors: { openai: [
    { id: "a", label: "A", kind: "CHAT", performance: { throughputTps: -1, indicative: false } },
  ] } });
  assert.ok(errs.some((e) => /performance.indicative must be true/.test(e)));
  assert.ok(errs.some((e) => /performance missing string source/.test(e)));
  assert.ok(errs.some((e) => /invalid performance.throughputTps/.test(e)));
});

test("benchmarks adapter: emits a performance object + benchmarks from one snapshot entry (Block I / T43)", () => {
  const [d] = benchmarks.normalize({
    source: "Artificial Analysis", lastVerified: "2026-07-22",
    models: [{ vendor: "openai", id: "gpt-5", intelligenceIndex: 69, throughputTps: 180, latencyTtftSec: 0.4 }],
  });
  assert.equal(d.benchmarks.intelligenceIndex, 69);
  assert.deepEqual(d.performance, {
    throughputTps: 180, latencyTtftSec: 0.4, indicative: true,
    note: "Cited third-party benchmark — verify at the source.",
    source: "Artificial Analysis", lastVerified: "2026-07-22",
  });
  // a snapshot entry with ONLY speed still emits (performance without benchmarks).
  const [p] = benchmarks.normalize({ source: "AA", lastVerified: WHEN, models: [{ vendor: "x", id: "fast", throughputTps: 500 }] });
  assert.equal(p.benchmarks, undefined, "no capability numbers → no benchmarks object");
  assert.equal(p.performance.throughputTps, 500);
});

test("diffReport: counts add/remove/change", () => {
  const existing = { vendors: { openai: [{ id: "old", label: "Old", kind: "CHAT" }, { id: "chg", label: "Chg", kind: "CHAT" }] } };
  const proposed = { vendors: { openai: [{ id: "chg", label: "Chg", kind: "CHAT", contextWindow: 100, sources: ["litellm"] }, { id: "new", label: "New", kind: "CHAT", sources: ["openai-api"] }] } };
  const { stats } = diffReport(existing, proposed, {});
  assert.equal(stats.added, 1);
  assert.equal(stats.removed, 1);
  assert.equal(stats.changed, 1);
});
