/**
 * models.dev enrichment source (Block T / T84). Ingests the public, keyless
 * `https://models.dev/api.json` — a PR-reviewed, schema-validated registry keyed by
 * provider — for the metadata no vendor API and LiteLLM carry: `releaseDate`,
 * `knowledgeCutoff` and `openWeights`, plus limits, modalities and capability hints.
 *
 * Same footing as LiteLLM: enrichment only (`vendor: null`, so it never anchors a new
 * id), ranked just below LiteLLM in lib/merge.mjs so it fills blank fields and never
 * overrides a vendor API, the committed catalog or a LiteLLM price.
 *
 * @since 2026.3.4 (T84)
 */
import { compact, fetchOrReplay } from "../lib/util.mjs";

const URL = "https://models.dev/api.json";

/** models.dev provider key → our catalog vendor key. Unmapped providers are dropped. */
const PROVIDER_TO_VENDOR = {
  openai: "openai",
  anthropic: "anthropic",
  google: "gemini",
  "google-vertex": "vertex-ai",
  "amazon-bedrock": "bedrock",
  azure: "azure",
  cohere: "cohere",
  mistral: "mistral",
  deepseek: "deepseek",
  xai: "xai",
  minimax: "minimax",
  zai: "zai",
  alibaba: "qwen",
  groq: "groq",
  togetherai: "together",
  "fireworks-ai": "fireworks",
  cerebras: "cerebras",
  openrouter: "openrouter",
  vercel: "vercel",
};

// models.dev reports an embedding's vector size as `limit.output` and its output
// modality as "text"; neither is a token limit or a generated modality, so skip them.
const NON_GENERATIVE = new Set(["embedding", "reranking"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_OR_DATE = /^\d{4}-\d{2}(-\d{2})?$/;

function posInt(v) {
  return Number.isInteger(v) && v >= 1 ? v : undefined;
}

function capabilitiesFrom(m) {
  const caps = [];
  if (m.tool_call) caps.push("tools");
  if (m.modalities?.input?.includes("image")) caps.push("vision");
  if (m.reasoning) caps.push("reasoning");
  return caps;
}

/** `cost` is USD per 1M tokens already; omitted when no usable cost is present. */
function pricingFrom(cost) {
  const usd = (v) => (typeof v === "number" && v > 0 ? v : undefined);
  const inputPer1M = usd(cost?.input);
  const outputPer1M = usd(cost?.output);
  if (inputPer1M === undefined && outputPer1M === undefined) return undefined;
  return compact({
    inputPer1M,
    outputPer1M,
    currency: "USD",
    unit: "per_1M_tokens",
    indicative: true,
    note: "Indicative US list price — verify with the vendor.",
    source: "models-dev",
  });
}

export default {
  id: "models-dev",
  vendor: null, // multi-vendor enrichment source
  envKey: null, // public, no auth
  label: "models.dev registry (release dates, cutoffs, open weights)",

  async fetch(_env, ctx) {
    return fetchOrReplay(this.id, URL, { offline: ctx.offline, when: ctx.when });
  },

  normalize(raw) {
    if (!raw || typeof raw !== "object") return [];
    const drafts = [];
    for (const [provider, spec] of Object.entries(raw)) {
      const vendor = PROVIDER_TO_VENDOR[provider];
      if (!vendor || !spec?.models || typeof spec.models !== "object") continue;
      for (const [key, m] of Object.entries(spec.models)) {
        if (!m || typeof m !== "object") continue;
        const generative = !NON_GENERATIVE.has(m.type);
        drafts.push(
          compact({
            vendor,
            id: m.id || key,
            releaseDate: ISO_DATE.test(m.release_date) ? m.release_date : undefined,
            knowledgeCutoff: ISO_MONTH_OR_DATE.test(m.knowledge) ? m.knowledge : undefined,
            openWeights: typeof m.open_weights === "boolean" ? m.open_weights : undefined,
            contextWindow: posInt(m.limit?.context),
            maxOutputTokens: generative ? posInt(m.limit?.output) : undefined,
            capabilities: capabilitiesFrom(m),
            modalities: generative ? compact({ input: m.modalities?.input, output: m.modalities?.output }) : undefined,
            pricing: pricingFrom(m.cost),
          }),
        );
      }
    }
    return drafts;
  },
};
