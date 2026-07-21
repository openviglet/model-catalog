/**
 * HuggingFace Hub source (T4). Anchors locally-runnable embedding models (the
 * `sentence-transformers` library — the ONNX/local embedding models Turing can run
 * without a hosted API) under a `huggingface` vendor row, resolving kind from the
 * model's `pipeline_tag`. Opt-in + token-gated: set `HUGGINGFACE_API_TOKEN` to
 * enable (also lifts the anonymous rate limit); unset → skipped, never a failure.
 *
 * Marked `partial`: this is a bounded, sorted-by-downloads query over a huge hub, so
 * it anchors the ids it returns but is NOT evidence to remove others.
 *
 * Dimensions are deliberately omitted — resolving them needs a per-model config
 * fetch, and the project prefers omitting a field over guessing it (overrides can pin
 * `embeddingDimensions` where it matters).
 *
 * @since 2026.3.4 (T4)
 */
import { compact, fetchOrReplay } from "../lib/util.mjs";

// Bounded, popularity-ranked slice of the sentence-transformers library.
const URL =
  "https://huggingface.co/api/models?filter=sentence-transformers&sort=downloads&direction=-1&limit=50";

const PIPELINE_TO_KIND = {
  "feature-extraction": "EMBEDDING",
  "sentence-similarity": "EMBEDDING",
  "text-generation": "CHAT",
  "text2text-generation": "CHAT",
  summarization: "CHAT",
};

export default {
  id: "huggingface-api",
  vendor: "huggingface",
  envKey: "HUGGINGFACE_API_TOKEN",
  partial: true,
  label: "HuggingFace Hub (sentence-transformers)",

  async fetch(env, ctx) {
    return fetchOrReplay(this.id, URL, {
      headers: { Authorization: `Bearer ${env.HUGGINGFACE_API_TOKEN}` },
      offline: ctx.offline,
      when: ctx.when,
    });
  },

  normalize(raw) {
    const models = Array.isArray(raw) ? raw : [];
    return models
      .map((m) => ({ id: m?.id || m?.modelId, tag: m?.pipeline_tag }))
      .filter((m) => typeof m.id === "string" && m.id.length)
      // No label: the repo id is the canonical ref; leave the display label to
      // committed/overrides. sentence-transformers without a pipeline tag → EMBEDDING.
      .map((m) => compact({ vendor: "huggingface", id: m.id, kind: PIPELINE_TO_KIND[m.tag] || "EMBEDDING" }));
  },
};
