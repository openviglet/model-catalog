/**
 * xAI live-API fetcher (Block T / T86). GET /v1/models is OpenAI-compatible and
 * carries only ids, so kind is inferred from the id (grok-imagine-image → IMAGE,
 * grok-imagine-video → VIDEO, the rest CHAT). Metadata comes from LiteLLM/models.dev
 * at merge time; this source's job is current ids and removal evidence, scoped by
 * merge to the kinds the listing returned (T82).
 *
 * @since 2026.3.4 (T86)
 */
import { classifyKind, compact, fetchOrReplay } from "../lib/util.mjs";

export default {
  id: "xai-api",
  vendor: "xai",
  envKey: "XAI_API_KEY",
  label: "xAI /v1/models",

  async fetch(env, ctx) {
    return fetchOrReplay(this.id, "https://api.x.ai/v1/models", {
      headers: { Authorization: `Bearer ${env.XAI_API_KEY}` },
      offline: ctx.offline,
      when: ctx.when,
    });
  },

  normalize(raw) {
    const data = Array.isArray(raw?.data) ? raw.data : [];
    return data
      .map((m) => m?.id)
      .filter((id) => typeof id === "string" && id)
      .map((id) => compact({ vendor: "xai", id, kind: classifyKind(id) }));
  },
};
