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
 *  - matching resolves an AA slug to a catalog `(vendor, id)` in two steps: the
 *    curated table (`artificial-analysis-map.json`) wins, then a DETERMINISTIC
 *    auto-matcher (T63) resolves the rest against the committed catalog ids —
 *    matching ONLY on an identical *and unique* canonical/token form, never by fuzzy
 *    similarity. An ambiguous or unrecognised slug is dropped (omit, don't guess), so
 *    the "never mis-attribute" guarantee holds; the table also *blocks* a slug
 *    (`null` / `{skip:true}`) or overrides a reordered/aliased name the matcher can't.
 *  - every draft is provenance-stamped (`indicative` + `source` + `lastVerified`);
 *    a fetch failure / empty map returns nothing (skipped), never a bad publish —
 *    the numbers are still *cited* ("verify at the source"), only the fill is now
 *    automatic. Propose-and-review like every source: a bad fetch lands in the diff.
 *
 * @since 2026.3.x (T45)
 */
import { existsSync } from "node:fs";
import { AA_MAP_FILE, CANONICAL, loadSnapshot, readJson, saveSnapshot, warn } from "../lib/util.mjs";
import { benchmarkDraft } from "./benchmarks.mjs";

// Artificial Analysis V2 language-models API, free tier (T97: the legacy
// `/api/v2/data/llms/models` answers 410 Gone since 2026-11-04; the Pro path needs a
// subscription). Pages of `data[]` with `pagination.has_more`; each model's
// `evaluations{}` holds the cited indices and `performance{}` the speed metrics.
const API_URL = "https://artificialanalysis.ai/api/v2/language/models/free";
const MAX_PAGES = 50; // a runaway `has_more` guard, far above the 4 pages served today

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

// AA reports 0 / null for a metric it did NOT measure (e.g. speed for a model it
// doesn't host). Treat any non-positive value as absent so those become omitted
// fields rather than a bogus "0 tok/s" / "0s latency" / "0 index" measurement.
const posNum = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

/** Load the committed slug→(vendor,id) matching table (`{ map: {...} }`), or {}. */
function loadMap() {
  if (!existsSync(AA_MAP_FILE)) return {};
  const raw = readJson(AA_MAP_FILE);
  return raw && typeof raw.map === "object" && raw.map ? raw.map : {};
}

/** Flat `[{vendor,id}]` of the committed catalog — the pool auto-matching resolves into. */
function loadCatalogIds() {
  if (!existsSync(CANONICAL)) return [];
  const root = readJson(CANONICAL);
  const vendors = (root && root.vendors) || {};
  const out = [];
  for (const [vendor, entries] of Object.entries(vendors)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) if (e && e.id) out.push({ vendor, id: e.id });
  }
  return out;
}

// ── Deterministic auto-matching (T63) ──────────────────────────────────────
// The curated map (above) is authoritative; anything it doesn't list is passed to
// a *deterministic* auto-matcher that resolves an AA slug to a catalog id ONLY when
// a canonical form is IDENTICAL and UNIQUE across the catalog — never by fuzzy
// similarity. So the T45 "never mis-attribute" guarantee holds: an ambiguous or
// unrecognised slug still drops. Three canonical forms are tried, most-specific first
// (so a bare "gpt-4o" resolves to the un-dated id before its dated snapshots):
//   A) exactKey — lower-cased, `org/` prefix stripped, separators removed, DATE KEPT.
//      "gpt-4o" ↔ "gpt-4o"; "gpt-4o-2024-08-06" ↔ its exact self.
//   B) normKey  — like A but with a trailing date snapshot stripped.
//      Matches "gemini-1-5-flash" ↔ "gemini-1.5-flash", "claude-3-5-haiku" ↔ "…-20241022".
//   C) tokenKey — the B base as an ORDER-INDEPENDENT sorted token multiset.
//      Matches reordered names: AA "claude-4-8-opus" ↔ catalog "claude-opus-4-8".
const DATE_RE = /[-_@]?(20\d{2}[-_]?\d{2}[-_]?\d{2}|20\d{6})$/;
const strip = (s) => String(s).toLowerCase().replace(/^[^/]*\//, ""); // drop "org/" prefix
const exactKey = (s) => strip(s).replace(/[^a-z0-9]+/g, ""); // full form — keeps the date
const normKey = (s) => strip(s).replace(DATE_RE, "").replace(/[^a-z0-9]+/g, ""); // date-stripped
const tokenKey = (s) => strip(s).replace(DATE_RE, "").split(/[^a-z0-9]+/).filter(Boolean).sort().join("|");

/** Build unique-only indexes over the catalog ids for each canonical form. */
export function buildMatchIndex(catalogIds) {
  const byExact = new Map(); // exactKey → Set<"vendor::id">
  const byNorm = new Map(); //  normKey  → Set<"vendor::id">
  const byTok = new Map(); //   tokenKey → Set<"vendor::id">
  const target = new Map(); // "vendor::id" → {vendor,id}
  const add = (m, k, v) => {
    if (!k) return;
    let set = m.get(k);
    if (!set) { set = new Set(); m.set(k, set); }
    set.add(v);
  };
  for (const t of catalogIds) {
    if (!t || !t.vendor || !t.id) continue;
    const key = `${t.vendor}::${t.id}`;
    target.set(key, { vendor: t.vendor, id: t.id });
    add(byExact, exactKey(t.id), key);
    add(byNorm, normKey(t.id), key);
    add(byTok, tokenKey(t.id), key);
  }
  return { byExact, byNorm, byTok, target };
}
// AA creator → catalog vendor key, where the two differ. The creator is the legacy
// `model_creator.slug`, or the V2 `model_creator.name` lower-cased with non-alphanumerics
// dropped ("Z AI" → "zai"); any other creator is tried as the vendor key itself.
const CREATOR_TO_VENDOR = { google: "gemini", kimi: "moonshot", alibaba: "qwen", spacexai: "xai" };

/** The row's creator key: legacy slug, else the V2 name squeezed to [a-z0-9]. */
export function creatorOf(item) {
  const c = item?.model_creator;
  if (!c) return undefined;
  if (typeof c.slug === "string" && c.slug) return c.slug;
  return typeof c.name === "string" ? c.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || undefined : undefined;
}

/**
 * A canonical-form lookup that returns a target ONLY when exactly one id matches.
 * Several matches are usually the creator's id plus gateway copies of it
 * (`claude-opus-5-5` and `openrouter/anthropic/claude-opus-5.5`), so the tie breaks
 * to the one id under the AA row's creator vendor (T96); anything else still drops.
 */
function uniqueMatch(index, mapObj, key, creator) {
  const set = mapObj.get(key);
  if (!set) return undefined;
  let keys = [...set];
  if (keys.length > 1 && creator) {
    const vendor = CREATOR_TO_VENDOR[creator] || creator;
    keys = keys.filter((k) => index.target.get(k).vendor === vendor);
  }
  if (keys.length !== 1) return undefined; // absent OR ambiguous → skip (never guess)
  return index.target.get(keys[0]);
}
/**
 * Resolve an AA slug to a catalog `{vendor,id}`:
 *   1. curated map wins — an entry that is `null`/`{skip:true}` explicitly BLOCKS the
 *      slug (suppresses a wrong auto-match); a `{vendor,id}` entry is used as-is.
 *   2. otherwise auto-match: exactKey → normKey → tokenKey, unique-only, a tie broken
 *      by the row's creator (`creator` = AA `model_creator.slug`, optional).
 * Returns undefined when nothing resolves — the slug is then dropped, as before.
 */
export function resolveTarget(slug, map, index, creator) {
  if (Object.hasOwn(map, slug)) {
    const m = map[slug];
    if (!m || m.skip) return undefined; // explicit block
    return m.vendor && m.id ? { vendor: m.vendor, id: m.id } : undefined;
  }
  return uniqueMatch(index, index.byExact, exactKey(slug), creator)
    || uniqueMatch(index, index.byNorm, normKey(slug), creator)
    || uniqueMatch(index, index.byTok, tokenKey(slug), creator);
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
    const v = posNum(ev[key]);
    if (v !== undefined) scores[domain] = v;
  }
  return {
    vendor: target.vendor,
    id: target.id,
    intelligenceIndex: posNum(ev[INTELLIGENCE_KEY]),
    scores: Object.keys(scores).length ? scores : undefined,
    // V2 nests speed under `performance{}`; a legacy snapshot keeps it top-level.
    throughputTps: posNum(item.performance?.median_output_tokens_per_second ?? item.median_output_tokens_per_second),
    latencyTtftSec: posNum(item.performance?.median_time_to_first_token_seconds ?? item.median_time_to_first_token_seconds),
  };
}

/**
 * Walk every V2 page into one `{ data: [...] }` snapshot (T97). Offline replays it;
 * any failed page falls back to the cached snapshot, the same fail-soft contract as
 * `fetchOrReplay`. Returns { raw, fetchedAt, fromCache } or null.
 */
async function fetchAllPages(sourceId, headers, { offline, when }) {
  const cached = () => {
    const snap = loadSnapshot(sourceId);
    if (!snap) { warn(`${sourceId}: no cached snapshot; skipping`); return null; }
    return { raw: snap.raw, fetchedAt: snap.fetchedAt, fromCache: true };
  };
  if (offline) return cached();
  const data = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(`${API_URL}?page=${page}`, { headers });
      if (!res.ok) { warn(`${sourceId}: ${API_URL} page ${page} -> HTTP ${res.status}; using cached snapshot`); return cached(); }
      const body = await res.json();
      data.push(...itemsOf(body));
      if (!body?.pagination?.has_more) break;
    }
  } catch (e) {
    warn(`${sourceId}: fetch failed (${e.message}); using cached snapshot`);
    return cached();
  }
  const raw = { data };
  saveSnapshot(sourceId, API_URL, raw, when);
  return { raw, fetchedAt: when, fromCache: false };
}

export default {
  id: "artificial-analysis",
  vendor: null, // multi-vendor enrichment source — never introduces an id
  envKey: "ARTIFICIAL_ANALYSIS_API_KEY", // opt-in: online only with a key; offline replays cache
  label: "Artificial Analysis leaderboard (live, cited)",

  // Fetch the leaderboard (key in a header) or replay the cached snapshot offline.
  // The curated map + the committed catalog ids are attached to `raw` so `normalize`
  // stays a pure function of `raw` (and thus unit-testable without touching the fs).
  async fetch(env, ctx) {
    const key = env.ARTIFICIAL_ANALYSIS_API_KEY;
    const res = await fetchAllPages(this.id, key ? { "x-api-key": key } : {}, ctx);
    if (!res) return null;
    return { ...res, raw: { items: itemsOf(res.raw), map: loadMap(), catalogIds: loadCatalogIds() } };
  },

  // `raw` = { items: AA models[], map: slug→{vendor,id}, catalogIds: [{vendor,id}] }.
  // Each slug resolves via the curated map first, then the deterministic auto-matcher
  // (unique canonical/token match) — anything unresolved drops (fail safe).
  normalize(raw) {
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const map = raw && typeof raw.map === "object" && raw.map ? raw.map : {};
    const catalogIds = Array.isArray(raw?.catalogIds) ? raw.catalogIds : [];
    if (!items.length) return [];
    const index = buildMatchIndex(catalogIds);
    const drafts = [];
    for (const item of items) {
      const slug = item && (item.slug || item.id);
      if (!slug) continue;
      const target = resolveTarget(slug, map, index, creatorOf(item)); // map → auto-match → undefined
      if (!target) continue; // unmapped / ambiguous → dropped
      const draft = benchmarkDraft(toSnapshotModel(item, target), { source: SOURCE });
      if (draft) drafts.push(draft);
    }
    return drafts;
  },
};
