/**
 * DeepSeek live-API fetcher (Block T / T86). GET /models is OpenAI-compatible and
 * lists only the ids the API serves (all CHAT); metadata comes from LiteLLM/models.dev
 * at merge time. This source's job is current ids and removal evidence.
 *
 * @since 2026.3.4 (T86)
 */
import { compact, fetchOrReplay } from "../lib/util.mjs";

export default {
  id: "deepseek-api",
  vendor: "deepseek",
  envKey: "DEEPSEEK_API_KEY",
  label: "DeepSeek /models",

  async fetch(env, ctx) {
    return fetchOrReplay(this.id, "https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      offline: ctx.offline,
      when: ctx.when,
    });
  },

  normalize(raw) {
    const data = Array.isArray(raw?.data) ? raw.data : [];
    return data
      .map((m) => m?.id)
      .filter((id) => typeof id === "string" && id)
      .map((id) => compact({ vendor: "deepseek", id, kind: "CHAT" }));
  },
};
