/**
 * LiteLLM community-registry cross-source (Block BD / T767). Ingests
 * `model_prices_and_context_window.json` as a vendor-agnostic enrichment layer
 * for the numeric/capability fields the live vendor APIs leave blank
 * (contextWindow, maxOutputTokens, modalities, capability hints). No key needed.
 *
 * **Pricing** (Block F / T31, reversing the original non-pricing stance): LiteLLM's
 * per-token USD costs are mapped into the catalog's *indicative US list price* shape
 * (`pricing`, expressed per 1,000,000 tokens), flagged non-authoritative and
 * provenance-stamped `source: "litellm"`. Bounded to US list price only, never
 * invented (omitted when no usable cost is present) — see STRATEGY §I / agents.md.
 *
 * @since 2026.3.4 (T767)
 */
import { compact, fetchOrReplay } from "../lib/util.mjs";

const URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

/** litellm_provider → our catalog vendor key. Unmapped providers are dropped. */
const PROVIDER_TO_VENDOR = {
  openai: "openai",
  text_completion_openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  cohere: "cohere",
  cohere_chat: "cohere",
  mistral: "mistral",
  bedrock: "bedrock",
  bedrock_converse: "bedrock",
  vertex_ai: "vertex-ai",
  "vertex_ai-language-models": "vertex-ai",
  "vertex_ai-chat-models": "vertex-ai",
  "vertex_ai-embedding-models": "vertex-ai",
  voyage: "voyage",
  ollama: "ollama",
  deepseek: "deepseek",
  xai: "xai",
  minimax: "minimax",
  zai: "zai", // Z.ai (formerly Zhipu AI) — the GLM family
  // Provider coverage expansion (Block H / T36): fast-inference hosts, Alibaba Qwen
  // (DashScope) and Azure. Their models/prices ride in via LiteLLM once a curated set
  // of ids is anchored in overrides.json (the anchoring rule still bars litellm-only ids).
  groq: "groq",
  together_ai: "together",
  fireworks_ai: "fireworks",
  "fireworks_ai-embedding-models": "fireworks",
  cerebras: "cerebras",
  dashscope: "qwen", // Alibaba Cloud Qwen via Model Studio / DashScope
  azure: "azure",
  azure_ai: "azure",
  azure_text: "azure",
  // Aggregators / gateways (Block H / T37): they re-serve many vendors' models, so
  // only a small CURATED cap of ids is anchored (overrides.json) — never their full
  // pass-through lists, which would balloon and duplicate the per-creator catalog.
  openrouter: "openrouter",
  vercel_ai_gateway: "vercel",
  // Image/video creators reached only through LiteLLM (T89). fal.ai is a host, like
  // OpenRouter, so it stays unmapped: it would only re-list these creators' models.
  stability: "stability",
  black_forest_labs: "bfl",
  recraft: "recraft",
  runwayml: "runway",
  volcengine: "volcengine", // ByteDance's cloud: Seedance video, Doubao chat
};

/**
 * Where LiteLLM may anchor a new id (T89), as `vendor` (every kind) or `vendor:KIND`.
 * Only a creator's own media API qualifies: the media-only creators whole, and the
 * media kinds of creators whose chat ids a live API or models.dev already anchors.
 * Merge still drops an id whose vendor's live listing covers that kind and omits it.
 */
const ANCHORS = [
  "stability", "bfl", "recraft", "runway:IMAGE", "runway:VIDEO", // Runway also re-serves ElevenLabs speech
  "volcengine:VIDEO", "qwen:VIDEO", "qwen:IMAGE", "gemini:VIDEO",
  "minimax:VIDEO", "xai:VIDEO", "xai:IMAGE",
];

const MODE_TO_KIND = {
  chat: "CHAT",
  completion: "CHAT",
  responses: "CHAT",
  embedding: "EMBEDDING",
  rerank: "RERANK",
  image_generation: "IMAGE",
  image_edit: "IMAGE",
  video_generation: "VIDEO",
  audio_transcription: "TRANSCRIPTION",
  audio_speech: "SPEECH",
  moderation: "MODERATION",
  moderations: "MODERATION",
};

/**
 * A schema-valid numeric field is a positive integer. LiteLLM reports `0` for
 * inapplicable fields (e.g. moderation models carry `max_output_tokens: 0` —
 * they emit no tokens), which violates the schema's `minimum: 1`. Treat any
 * non-positive value as absent so the field is omitted rather than emitted invalid.
 */
function posInt(v) {
  return Number.isInteger(v) && v >= 1 ? v : undefined;
}

function capabilitiesFrom(spec) {
  const caps = [];
  if (spec.supports_function_calling) caps.push("tools");
  if (spec.supports_vision) caps.push("vision");
  if (spec.supports_reasoning) caps.push("reasoning");
  return caps;
}

/**
 * Map LiteLLM's per-token USD costs into the catalog's indicative pricing shape
 * (Block F / T31). LiteLLM reports `*_cost_per_token` in USD *per token*; we
 * express it per 1,000,000 tokens (rounded to 6 dp to shed float noise). The
 * figure is flagged `indicative` + non-authoritative and stamped `source:
 * "litellm"` (merge stamps `lastVerified`). Returns undefined when no usable
 * cost is present — a price is never invented.
 */
function pricingFrom(spec) {
  const per1M = (v) => (typeof v === "number" && v > 0 ? Math.round(v * 1e12) / 1e6 : undefined);
  const inputPer1M = per1M(spec.input_cost_per_token);
  const outputPer1M = per1M(spec.output_cost_per_token);
  if (inputPer1M === undefined && outputPer1M === undefined) return undefined;
  return compact({
    inputPer1M,
    outputPer1M,
    currency: "USD",
    unit: "per_1M_tokens",
    indicative: true,
    note: "Indicative US list price — verify with the vendor.",
    source: "litellm",
  });
}

function modalitiesFrom(spec) {
  const input = new Set(["text"]);
  const output = new Set();
  if (spec.supports_vision || (spec.supported_modalities || []).includes?.("image")) input.add("image");
  if (spec.supports_pdf_input) input.add("pdf");
  if (spec.supports_audio_input) input.add("audio");
  for (const m of spec.supported_modalities || []) input.add(m);
  for (const m of spec.supported_output_modalities || []) output.add(m);
  if (spec.mode === "embedding") output.add("embedding");
  const res = {};
  if (input.size) res.input = [...input];
  if (output.size) res.output = [...output];
  return Object.keys(res).length ? res : undefined;
}

export default {
  id: "litellm",
  vendor: null, // multi-vendor enrichment source
  envKey: null, // public, no auth
  label: "LiteLLM registry (metadata + indicative pricing)",
  anchorVendors: ANCHORS,

  async fetch(_env, ctx) {
    return fetchOrReplay(this.id, URL, { offline: ctx.offline, when: ctx.when });
  },

  normalize(raw) {
    if (!raw || typeof raw !== "object") return [];
    const drafts = [];
    for (const [key, spec] of Object.entries(raw)) {
      if (key === "sample_spec" || !spec || typeof spec !== "object") continue;
      if (key.includes("*")) continue; // wildcard rate entries, not real ids
      const vendor = PROVIDER_TO_VENDOR[spec.litellm_provider];
      if (!vendor) continue; // provider we don't track
      // Bare model id sent to the vendor (drop any "provider/" prefix).
      const id = key.includes("/") ? key.slice(key.indexOf("/") + 1) : key;
      drafts.push(
        compact({
          vendor,
          id,
          // No label from litellm — it is keyed by id; leave label to vendor/overrides.
          kind: MODE_TO_KIND[spec.mode] || undefined,
          contextWindow: posInt(spec.max_input_tokens) ?? posInt(spec.max_tokens),
          maxOutputTokens: posInt(spec.max_output_tokens),
          embeddingDimensions: posInt(spec.output_vector_size),
          capabilities: capabilitiesFrom(spec),
          modalities: modalitiesFrom(spec),
          pricing: pricingFrom(spec),
        }),
      );
    }
    return drafts;
  },
};
