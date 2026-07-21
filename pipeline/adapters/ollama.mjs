/**
 * Ollama self-hosted source (T4). Reads a running daemon's `GET /api/tags` — the
 * authoritative list of models actually pulled on this host — and anchors those
 * ids under the `ollama` vendor row, which previously relied on LiteLLM alone (and
 * so could never introduce a new id). Opt-in + host-gated: set `OLLAMA_HOST`
 * (e.g. `http://localhost:11434`) to enable; unset → skipped, never a failure.
 *
 * Marked `partial`: a local `ollama list` reflects one machine's pulled models, not
 * the full library, so it anchors ids but is NOT positive evidence to remove others.
 *
 * @since 2026.3.4 (T4)
 */
import { classifyKind, compact, fetchOrReplay } from "../lib/util.mjs";

export default {
  id: "ollama-api",
  vendor: "ollama",
  envKey: "OLLAMA_HOST",
  partial: true,
  label: "Ollama /api/tags",

  async fetch(env, ctx) {
    const base = String(env.OLLAMA_HOST || "").replace(/\/+$/, "");
    return fetchOrReplay(this.id, `${base}/api/tags`, {
      offline: ctx.offline,
      when: ctx.when,
    });
  },

  normalize(raw) {
    const models = Array.isArray(raw?.models) ? raw.models : [];
    return models
      .map((m) => m?.model || m?.name)
      .filter((id) => typeof id === "string" && id.length)
      // No label: the id is the ref sent to Ollama (`llama3:8b`) — leave the display
      // label to the committed catalog / overrides. Kind is heuristic from the name.
      .map((id) => compact({ vendor: "ollama", id, kind: classifyKind(id) }));
  },
};
