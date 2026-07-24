/**
 * OpenRouter aggregator source (T78). OpenRouter is a gateway that re-serves many
 * creators' models under one API; its public `/api/v1/models` endpoint (no key)
 * returns a rich, machine-readable listing — context length, per-token USD pricing,
 * input/output modalities and supported parameters — so unlike the curated LiteLLM
 * pass-through (which the anchoring rule bars from introducing ids), this adapter is
 * a first-class VENDOR source for the `openrouter` row: it anchors ids and its live
 * listing is removal evidence for stale ones.
 *
 * Ids keep OpenRouter's `creator/model` form (e.g. `anthropic/claude-3-haiku`) — the
 * exact ref sent to the gateway — matching the ids already committed under this vendor.
 *
 * **Pricing** (Block F): OpenRouter reports `pricing.prompt`/`pricing.completion` as
 * USD *per token* (strings); mapped into the catalog's indicative US list shape
 * (per 1,000,000 tokens), flagged non-authoritative, stamped `source: "openrouter"`.
 * Free models (price "0") get no pricing — a figure is never invented.
 *
 * @since 2026.3.x (T78)
 */
import { compact, fetchOrReplay } from "../lib/util.mjs";

const URL = "https://openrouter.ai/api/v1/models";

/** OpenRouter modality tokens → our schema's modality enums (file = document/pdf). */
const INPUT_MODALITY = { text: "text", image: "image", audio: "audio", video: "video", file: "pdf" };
const OUTPUT_MODALITY = { text: "text", image: "image", audio: "audio", video: "video" };

/** A schema-valid numeric field is a positive integer; treat 0/absent as omitted. */
function posInt(v) {
  return Number.isInteger(v) && v >= 1 ? v : undefined;
}

/** USD-per-token string → USD per 1,000,000 tokens (6 dp), or undefined when not positive. */
function per1M(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e12) / 1e6 : undefined;
}

function pricingFrom(p) {
  if (!p || typeof p !== "object") return undefined;
  const inputPer1M = per1M(p.prompt);
  const outputPer1M = per1M(p.completion);
  if (inputPer1M === undefined && outputPer1M === undefined) return undefined;
  return compact({
    inputPer1M,
    outputPer1M,
    currency: "USD",
    unit: "per_1M_tokens",
    indicative: true,
    note: "Indicative US list price — verify with the vendor.",
    source: "openrouter",
  });
}

function modalitiesFrom(arch) {
  const input = [];
  for (const m of arch?.input_modalities || []) {
    const mapped = INPUT_MODALITY[m];
    if (mapped && !input.includes(mapped)) input.push(mapped);
  }
  const output = [];
  for (const m of arch?.output_modalities || []) {
    const mapped = OUTPUT_MODALITY[m];
    if (mapped && !output.includes(mapped)) output.push(mapped);
  }
  const res = {};
  if (input.length) res.input = input;
  if (output.length) res.output = output;
  return Object.keys(res).length ? res : undefined;
}

function capabilitiesFrom(spec) {
  const params = new Set(spec.supported_parameters || []);
  const input = new Set(spec.architecture?.input_modalities || []);
  const caps = [];
  if (params.has("tools") || params.has("tool_choice")) caps.push("tools");
  if (params.has("reasoning") || params.has("include_reasoning")) caps.push("reasoning");
  if (input.has("image")) caps.push("vision");
  return caps;
}

/** OpenRouter is a chat/completion gateway; refine to IMAGE/SPEECH only for pure media output. */
function kindFrom(arch) {
  const out = new Set(arch?.output_modalities || []);
  if (out.has("image") && !out.has("text")) return "IMAGE";
  if (out.has("audio") && !out.has("text")) return "SPEECH";
  return "CHAT";
}

/** ISO date (YYYY-MM-DD) or year-month, else undefined — never a reshaped guess. */
function isoDateish(v) {
  return typeof v === "string" && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v) ? v : undefined;
}

export default {
  id: "openrouter-api",
  vendor: "openrouter",
  envKey: null, // public listing, no auth
  label: "OpenRouter /api/v1/models",

  async fetch(_env, ctx) {
    return fetchOrReplay(this.id, URL, { offline: ctx.offline, when: ctx.when });
  },

  normalize(raw) {
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    const drafts = [];
    for (const spec of list) {
      if (!spec || typeof spec.id !== "string" || !spec.id) continue;
      drafts.push(
        compact({
          vendor: "openrouter",
          id: spec.id,
          label: typeof spec.name === "string" && spec.name.trim() ? spec.name : spec.id,
          kind: kindFrom(spec.architecture),
          contextWindow: posInt(spec.context_length) ?? posInt(spec.top_provider?.context_length),
          maxOutputTokens: posInt(spec.top_provider?.max_completion_tokens),
          capabilities: capabilitiesFrom(spec),
          modalities: modalitiesFrom(spec.architecture),
          knowledgeCutoff: isoDateish(spec.knowledge_cutoff),
          pricing: pricingFrom(spec.pricing),
        }),
      );
    }
    return drafts;
  },
};
