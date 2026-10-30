/**
 * models.dev enrichment source (Block T / T84). Ingests the public, keyless
 * `https://models.dev/api.json` — a PR-reviewed, schema-validated registry keyed by
 * provider — for the metadata no vendor API and LiteLLM carry: `releaseDate`,
 * `knowledgeCutoff` and `openWeights`, plus limits, modalities and capability hints.
 *
 * Same footing as LiteLLM: enrichment (`vendor: null`), ranked just below LiteLLM in
 * lib/merge.mjs so it fills blank fields and never overrides a vendor API, the
 * committed catalog or a LiteLLM price.
 *
 * **Creator anchoring (T85).** models.dev's *creator* sections (xai, mistral,
 * moonshotai, …) are curated per vendor and are the closest keyless thing to that
 * vendor's own list, so they may introduce new ids for the vendors in
 * `anchorVendors`. Host/gateway sections only enrich. It is never removal evidence
 * (models.dev lags the vendor), which stays with live vendor APIs.
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
  moonshotai: "moonshot",
  perplexity: "perplexity",
  stepfun: "stepfun",
  meta: "meta",
};

/** Catalog vendors whose models.dev section is the creator's own list, so it may anchor new ids. */
const CREATOR_VENDORS = [
  "xai", "mistral", "moonshot", "qwen", "zai", "cohere", "minimax", "deepseek", "meta", "stepfun", "perplexity",
];

// models.dev `type` → catalog kind; an untyped entry is a text model (CHAT). Only
// wins where no higher source set a kind, i.e. on an id this source anchored.
const TYPE_TO_KIND = {
  chat: "CHAT", realtime: "CHAT", embedding: "EMBEDDING", reranking: "RERANK", image: "IMAGE",
  video: "VIDEO", speech: "SPEECH", transcription: "TRANSCRIPTION",
};

// models.dev reports an embedding's vector size as `limit.output` and its output
// modality as "text"; neither is a token limit or a generated modality, so skip them.
const NON_GENERATIVE = new Set(["embedding", "reranking"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_OR_DATE = /^\d{4}-\d{2}(-\d{2})?$/;

function posInt(v) {
  return Number.isInteger(v) && v >= 1 ? v : undefined;
}

/**
 * models.dev dates a moving alias (`*-latest`, `qwen-plus`, `sonar`) by its first
 * launch, so the date misdescribes the model the alias now serves (T92). Omit it for
 * a `-latest` pointer and wherever the record's own cutoff falls after its release.
 */
function releaseDateOf(m, id) {
  if (!ISO_DATE.test(m.release_date) || id.endsWith("-latest")) return undefined;
  if (ISO_MONTH_OR_DATE.test(m.knowledge) && m.knowledge.slice(0, 7) > m.release_date.slice(0, 7)) return undefined;
  return m.release_date;
}

function kindOf(m) {
  return m.type === undefined ? "CHAT" : TYPE_TO_KIND[m.type];
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
  anchorVendors: CREATOR_VENDORS,

  async fetch(_env, ctx) {
    return fetchOrReplay(this.id, URL, { offline: ctx.offline, when: ctx.when });
  },

  normalize(raw) {
    if (!raw || typeof raw !== "object") return [];
    const drafts = [];
    for (const [provider, spec] of Object.entries(raw)) {
      const vendor = PROVIDER_TO_VENDOR[provider];
      if (!vendor || !spec?.models || typeof spec.models !== "object") continue;
      const creator = CREATOR_VENDORS.includes(vendor);
      for (const [key, m] of Object.entries(spec.models)) {
        if (!m || typeof m !== "object") continue;
        const generative = !NON_GENERATIVE.has(m.type);
        const id = m.id || key;
        drafts.push(
          compact({
            vendor,
            id,
            // label + kind only where this source can anchor; elsewhere they'd only conflict.
            label: creator && typeof m.name === "string" && m.name ? m.name : undefined,
            kind: creator ? kindOf(m) : undefined,
            releaseDate: releaseDateOf(m, id),
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
