/* Static lookup tables & captions for the page (T65). Pure data, no DOM/state. */
import type { ModelEntry } from "./types.js";

export const KINDS: string[] = ["CHAT","EMBEDDING","RERANK","IMAGE","TRANSCRIPTION","SPEECH","VIDEO","MODERATION","UNKNOWN"];
export const KIND_LABEL: Record<string, string> = { CHAT:"Chat", EMBEDDING:"Embedding", RERANK:"Rerank", IMAGE:"Image", TRANSCRIPTION:"Transcription", SPEECH:"Speech", VIDEO:"Video", MODERATION:"Moderation", UNKNOWN:"Other" };
export const KIND_COLOR: Record<string, string> = {
  CHAT:"#2563eb", EMBEDDING:"#059669", RERANK:"#d97706", IMAGE:"#c026d3",
  TRANSCRIPTION:"#0284c7", SPEECH:"#7c3aed", VIDEO:"#e11d48", MODERATION:"#64748b", UNKNOWN:"#64748b",
};
export const VENDOR_LABEL: Record<string, string> = {
  openai:"OpenAI", anthropic:"Anthropic", gemini:"Google Gemini", "gemini-openai":"Gemini (OpenAI-compatible)",
  ollama:"Ollama", "openai-compatible":"OpenAI-compatible", bedrock:"Amazon Bedrock", cohere:"Cohere",
  mistral:"Mistral", voyage:"Voyage AI", "vertex-ai":"Google Vertex AI",
  azure:"Azure OpenAI", cerebras:"Cerebras", deepseek:"DeepSeek", fireworks:"Fireworks AI",
  groq:"Groq", minimax:"MiniMax", openrouter:"OpenRouter", qwen:"Qwen", together:"Together AI",
  vercel:"Vercel", xai:"xAI", zai:"Z.ai",
};
// Per-vendor visual identity: a colour AND a shape (T64). Colour alone can't
// separate 22 vendors — several share a hue family (four Google/Azure blues,
// two Anthropic-warm oranges, several darks) — so identity is the composite
// colour×shape. Colours were solved (pipeline/../scratch, OKLab ΔE) so any two
// vendors sharing a shape are ≥19.8 ΔE apart; shape separates same-hue vendors.
// Brand colours kept where recognised; azure/vercel nod to brand.
export const VENDOR_STYLE: Record<string, { c: string; s: string }> = {
  openai:{c:"#10a37f",s:"circle"}, gemini:{c:"#4285f4",s:"circle"},
  "gemini-openai":{c:"#4285f4",s:"square"}, "vertex-ai":{c:"#1a73e8",s:"triangle"},
  bedrock:{c:"#ff9900",s:"square"}, mistral:{c:"#fa5111",s:"triangle"},
  voyage:{c:"#7c3aed",s:"diamond"}, ollama:{c:"#0f172a",s:"circle"},
  cohere:{c:"#39594d",s:"circle"}, anthropic:{c:"#d97757",s:"circle"},
  azure:{c:"#0284c7",s:"diamond"}, vercel:{c:"#1e293b",s:"square"},
  cerebras:{c:"#eab308",s:"triangle"}, zai:{c:"#dc2626",s:"square"},
  fireworks:{c:"#78716c",s:"square"}, groq:{c:"#c026d3",s:"circle"},
  minimax:{c:"#7c2d12",s:"triangle"}, xai:{c:"#db2777",s:"diamond"},
  together:{c:"#84cc16",s:"square"}, qwen:{c:"#f59e0b",s:"diamond"},
  deepseek:{c:"#a16207",s:"diamond"}, openrouter:{c:"#059669",s:"triangle"},
};
export const VENDOR_FALLBACK: { c: string; s: string } = { c:"#64748b", s:"circle" };
export const GROUP_OPTS: Array<[string | null, string]> = [[null, "None"], ["vendor", "Vendor"], ["kind", "Kind"], ["tier", "Tier"]];
export const TIER_ORDER: string[] = ["Frontier", "High", "Mid", "Light"]; // T38 tiers, high→low
export const ISSUE_NEW = "https://github.com/openviglet/model-catalog/issues/new";
export const TIER_BG: Record<string, string> = { Frontier: "#c2410c", High: "#ea580c", Mid: "#64748b", Light: "#0891b2" };
export const TIER_HINT = "Tier bucketed from the vendor's US list price (input / 1M) — a market signal for capability, not a benchmark or quality score.";
export const COL_ORDER: string[] = ["tags", "context", "output", "dims", "price", "intelligence", "speed", "params", "weights"];
export const NUMERIC_COLS = new Set(["context", "output", "dims", "price", "intelligence", "speed", "params"]); // right-aligned
// Kind-aware lean defaults (used when the user hasn't chosen columns explicitly).
export const DEFAULT_COLS: Record<string, string[]> = {
  CHAT: ["tags", "context", "price", "intelligence"],
  EMBEDDING: ["dims", "context", "price"],
  RERANK: ["context", "price"],
  IMAGE: ["tags", "price"],
  _: ["tags", "context", "price"],
};
export const PRICE_CAVEAT = "Indicative US list price per 1M tokens — a reference only, verify with the vendor.";
export const BENCH_CAVEAT = "Cited third-party capability index — a reference to a public leaderboard, not our verdict. Verify at the source.";
export const PERF_CAVEAT = "Cited speed metrics — a reference to a public measurement, not our benchmark. Verify at the source.";
export const PLAN_VENDOR_LABEL: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google", zai: "Z.ai" };
export const SOURCE_CAT_LABEL: Record<string, string> = {
  "model-creator": "Model creators (direct APIs)", "hyperscaler": "Hyperscaler clouds",
  "inference-provider": "Fast-inference providers", "aggregator": "Aggregators & gateways",
};
export const SOURCE_CAT_ORDER: string[] = ["model-creator", "hyperscaler", "inference-provider", "aggregator"];
export const COV_LABEL: Record<string, string> = {
  contextWindow: "Context", maxOutputTokens: "Max out", embeddingDimensions: "Embed dims",
  capabilities: "Capabilities", openWeights: "Open weights", parameters: "Params",
  modalities: "Modalities", knowledgeCutoff: "Cutoff",
  releaseDate: "Released", aliases: "Aliases", status: "Status", sources: "Sources", lastVerified: "Verified",
  pricing: "Price", benchmarks: "Benchmark", performance: "Speed",
};
// A gap → a pre-filled proposal for that vendor (change-type = correction). T28 tie-in.
export const PRESETS: Array<{ label: string; params: Record<string, string> }> = [
  { label: "Frontier reasoning", params: { tag: "Reasoning", tier: "Frontier" } },
  { label: "Open weights", params: { tag: "Open weights" } },
  { label: "Multimodal chat", params: { kind: "CHAT", tag: "Multimodal" } },
  { label: "Cheapest chat", params: { kind: "CHAT", has: "price", sort: "price:1", cols: "tags,context,price" } },
  { label: "Embeddings by dimension", params: { kind: "EMBEDDING", sort: "dims:-1", cols: "dims,context,price" } },
  { label: "Fastest", params: { has: "speed", sort: "speed:-1", cols: "tags,speed,price" } },
];
export const NUM_SORT: Record<string, (m: ModelEntry) => number | null | undefined> = {
  context: (m) => m.contextWindow,
  output: (m) => m.maxOutputTokens,
  dims: (m) => m.embeddingDimensions,
  price: (m) => m.pricing && m.pricing.inputPer1M,
  intelligence: (m) => m.benchmarks && m.benchmarks.intelligenceIndex,
  speed: (m) => m.performance && m.performance.throughputTps,
  params: (m) => m.parameters,
};
