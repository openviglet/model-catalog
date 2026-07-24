/**
 * Ollama library crawler (T79). The public `ollama.com/library` page lists the full
 * catalogue of pullable models — hundreds of them — which no JSON API exposes (the
 * registry endpoint speaks the Docker manifest protocol, not a browsable list). This
 * adapter fetches that page and parses the server-rendered HTML for each model's
 * name + capability badges, anchoring the whole library under the `ollama` vendor row
 * (previously only a handful of committed/host-pulled ids existed).
 *
 * Complements the host-scoped `ollama` adapter (T4, `OLLAMA_HOST` → locally pulled
 * models): this one is the library-wide view. Marked `partial` all the same — a
 * regexed HTML scrape is best-effort (fail-soft on markup drift), so it anchors ids
 * but is NOT positive evidence to remove others.
 *
 * Metadata is deliberately thin: name, kind (embedding badge vs chat), capability
 * badges (tools/thinking→reasoning/vision), coarse modalities, and `openWeights: true`
 * — a definitional fact for the library (every model is downloadable/self-hostable),
 * withheld only for `cloud`-badged hosted entries. No context window or pricing: the
 * listing carries neither reliably, and the catalog omits rather than guesses.
 *
 * @since 2026.3.x (T79)
 */
import { classifyKind, compact, fetchTextOrReplay } from "../lib/util.mjs";

const URL = "https://ollama.com/library";

/** Capability badge text → our capability keyword (embedding/audio handled as kind/modality). */
const CAP_MAP = { tools: "tools", thinking: "reasoning", vision: "vision" };

/**
 * Parse the library page HTML into per-model drafts. Best-effort + defensive: each
 * model is a list item anchored by `<a href="/library/NAME">`; we slice the page
 * between consecutive anchors and read the capability badges (spans coloured
 * `text-indigo-600`) inside each slice. Returns [] on unrecognised markup rather
 * than throwing, so a page redesign degrades to "no drafts", never a failed run.
 */
export function parseLibrary(html) {
  if (typeof html !== "string" || !html) return [];
  const anchor = /href="\/library\/([^"]+)"/g;
  const matches = [...html.matchAll(anchor)];
  const drafts = [];
  const seen = new Set();
  for (let i = 0; i < matches.length; i++) {
    const id = decodeURIComponent(matches[i][1]).trim();
    if (!id || id.includes("/") || seen.has(id)) continue; // skip nested/duplicate links
    seen.add(id);
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const block = html.slice(start, end);

    const badges = [...block.matchAll(/text-indigo-600[^>]*>([^<]+)</g)].map((m) => m[1].trim());
    const badgeSet = new Set(badges);
    const isCloud = /class="[^"]*"[^>]*>\s*cloud\s*</.test(block) || />\s*cloud\s*</.test(block);

    const caps = [];
    for (const b of badges) if (CAP_MAP[b] && !caps.includes(CAP_MAP[b])) caps.push(CAP_MAP[b]);

    const kind = badgeSet.has("embedding") ? "EMBEDDING" : classifyKind(id);

    const input = ["text"];
    if (badgeSet.has("vision")) input.push("image");
    if (badgeSet.has("audio")) input.push("audio");
    const modalities = { input };
    if (kind === "EMBEDDING") modalities.output = ["embedding"];

    drafts.push(
      compact({
        vendor: "ollama",
        id,
        label: id, // the pull ref is the identity; committed/overrides refine display
        kind,
        capabilities: caps,
        modalities,
        openWeights: isCloud ? undefined : true,
      }),
    );
  }
  return drafts;
}

export default {
  id: "ollama-library",
  vendor: "ollama",
  envKey: null, // public page, no auth
  partial: true, // HTML scrape is best-effort — anchor ids, never remove on its say-so
  label: "Ollama library (ollama.com/library)",

  async fetch(_env, ctx) {
    return fetchTextOrReplay(this.id, URL, {
      headers: { "User-Agent": "Mozilla/5.0 (model-catalog regen; +https://openviglet.github.io)" },
      offline: ctx.offline,
      when: ctx.when,
    });
  },

  normalize(raw) {
    return parseLibrary(raw);
  },
};
