/**
 * Live Artificial Analysis benchmark source (Block J / T45) — automates the T41
 * refresh. Instead of a maintainer hand-editing `pipeline/benchmarks.json`, this
 * fetches Artificial Analysis's public LLM leaderboard over the network and maps
 * its cited intelligence index, per-domain evals and speed metrics into the SAME
 * `benchmarks` + `performance` draft shape — reusing `benchmarkDraft` from T41, so
 * a model enriched by either path is provenance-stamped identically.
 *
 * Gated + fail-safe by construction:
 *  - `envKey: ARTIFICIAL_ANALYSIS_API_KEY` → an ONLINE run only fires when the key
 *    is set (opt-in, the orchestrator skips it otherwise); `--offline` replays the
 *    cached snapshot with no key and no network, exactly like every other source.
 *  - `vendor: null` → a non-anchoring enrichment source: the merge anchoring rule
 *    bars a leaderboard model absent from the catalog (dropped, never introduced).
 *  - matching is a CURATED, committed table (`artificial-analysis-map.json`): only
 *    an AA slug we have EXPLICITLY mapped to a catalog `(vendor, id)` emits — an
 *    unmapped model is dropped, never fuzzily mis-attributed (omit, don't guess).
 *  - every draft is provenance-stamped (`indicative` + `source` + `lastVerified`);
 *    a fetch failure / empty map returns nothing (skipped), never a bad publish —
 *    the numbers are still *cited* ("verify at the source"), only the fill is now
 *    automatic. Propose-and-review like every source: a bad fetch lands in the diff.
 *
 * @since 2026.3.x (T45)
 */
import { existsSync } from "node:fs";
import { AA_MAP_FILE, fetchOrReplay, readJson } from "../lib/util.mjs";
import { benchmarkDraft } from "./benchmarks.mjs";

// Artificial Analysis public data API (v2). The response carries a `data[]` array
// of models; each model's `evaluations{}` holds the cited indices and the top-level
// `median_*` fields hold the speed metrics.
const API_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";

// Cited source string — kept identical to the T41 snapshot's `source` so the live
// and curated paths never churn the field against each other.
const SOURCE = "Artificial Analysis";

// AA evaluation key → catalog benchmark domain (T42 `scores`). Only the sub-indices
// that map cleanly to our domains are carried; unlisted evals are ignored.
const EVAL_TO_DOMAIN = {
  artificial_analysis_coding_index: "coding",
  artificial_analysis_math_index: "math",
};
const INTELLIGENCE_KEY = "artificial_analysis_intelligence_index";

const finiteNum = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Load the committed slug→(vendor,id) matching table (`{ map: {...} }`), or {}. */
function loadMap() {
  if (!existsSync(AA_MAP_FILE)) return {};
  const raw = readJson(AA_MAP_FILE);
  return raw && typeof raw.map === "object" && raw.map ? raw.map : {};
}

/** Extract the models array from AA's response shape (defensive about wrappers). */
function itemsOf(raw) {
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw)) return raw;
  return [];
}

/**
 * Turn ONE AA leaderboard item + its resolved catalog target into a snapshot-model
 * of the exact shape `benchmarkDraft` (T41) consumes. `lastVerified` is intentionally
 * omitted so merge stamps the run date (≈ the live-fetch/verify date).
 */
function toSnapshotModel(item, target) {
  const ev = (item && typeof item.evaluations === "object" && item.evaluations) || {};
  const scores = {};
  for (const [key, domain] of Object.entries(EVAL_TO_DOMAIN)) {
    const v = finiteNum(ev[key]);
    if (v !== undefined) scores[domain] = v;
  }
  return {
    vendor: target.vendor,
    id: target.id,
    intelligenceIndex: finiteNum(ev[INTELLIGENCE_KEY]),
    scores: Object.keys(scores).length ? scores : undefined,
    throughputTps: finiteNum(item.median_output_tokens_per_second),
    latencyTtftSec: finiteNum(item.median_time_to_first_token_seconds),
  };
}

export default {
  id: "artificial-analysis",
  vendor: null, // multi-vendor enrichment source — never introduces an id
  envKey: "ARTIFICIAL_ANALYSIS_API_KEY", // opt-in: online only with a key; offline replays cache
  label: "Artificial Analysis leaderboard (live, cited)",

  // Fetch the leaderboard (key in a header) or replay the cached snapshot offline.
  // The committed matching table is attached to `raw` so `normalize` stays a pure
  // function of `raw` (and thus unit-testable without touching the filesystem).
  async fetch(env, ctx) {
    const key = env.ARTIFICIAL_ANALYSIS_API_KEY;
    const res = await fetchOrReplay(this.id, API_URL, {
      headers: key ? { "x-api-key": key } : {},
      offline: ctx.offline,
      when: ctx.when,
    });
    if (!res) return null;
    return { ...res, raw: { items: itemsOf(res.raw), map: loadMap() } };
  },

  // `raw` = { items: AA models[], map: slug→{vendor,id} }. Only mapped slugs emit;
  // an unmapped leaderboard model is dropped (fail safe). Empty map / no items → [].
  normalize(raw) {
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const map = raw && typeof raw.map === "object" && raw.map ? raw.map : {};
    if (!items.length || !Object.keys(map).length) return [];
    const drafts = [];
    for (const item of items) {
      const slug = item && (item.slug || item.id);
      const target = slug ? map[slug] : undefined;
      if (!target || !target.vendor || !target.id) continue; // unmapped → dropped
      const draft = benchmarkDraft(toSnapshotModel(item, target), { source: SOURCE });
      if (draft) drafts.push(draft);
    }
    return drafts;
  },
};
