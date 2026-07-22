/**
 * Cited-benchmark source (Block I / T41) — the data path that populates the T40
 * `benchmarks` field. Unlike the vendor/LiteLLM sources it fetches nothing over the
 * network: it reads a CURATED, committed snapshot (`pipeline/benchmarks.json`) that
 * maps a public, citable leaderboard (Artificial Analysis / LMArena) onto catalog
 * (vendor, id) pairs. That snapshot IS the matching table — the maintainer refreshes
 * it from the source and bumps `lastVerified`, so nothing is scraped or invented.
 *
 * Fail-safe by construction:
 *  - `vendor: null` → a multi-vendor **enrichment** source: it is NOT an anchoring
 *    source, so a leaderboard model absent from the catalog is simply dropped (the
 *    merge anchoring rule bars it), never introduced and never mis-attributed.
 *  - every emitted `benchmarks` object is provenance-stamped (`indicative: true` +
 *    `source` + `lastVerified`); an entry with no numbers or no source is skipped.
 *
 * Opt-in + offline-replayable: no snapshot file → skipped (never a failure); the
 * file is local so `--offline` and online runs behave identically. Propose-and-
 * review like every source — a bad snapshot lands in the diff, never auto-published.
 *
 * @since 2026.3.4 (T41)
 */
import { existsSync } from "node:fs";
import { BENCHMARKS_FILE, compact, readJson } from "../lib/util.mjs";

export const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

// Per-domain scores (T42): accept either a plain number (cites the parent source)
// or an object { value, source?, lastVerified? } (a domain cited from elsewhere).
// Returns a normalized { domain: { value, source?, lastVerified? } } map, or
// undefined when nothing valid is present — a score is never invented.
export function scoresFrom(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out = {};
  for (const [domain, s] of Object.entries(raw)) {
    const value = num(typeof s === "object" && s !== null ? s.value : s);
    if (value === undefined) continue;
    const entry = { value };
    if (s && typeof s === "object") {
      if (s.source) entry.source = String(s.source);
      if (s.lastVerified) entry.lastVerified = String(s.lastVerified);
    }
    out[domain] = entry;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Build a cited `benchmarks`/`performance` draft from ONE snapshot-model —
 * `{ vendor, id, intelligenceIndex?, arenaElo?, scores?, throughputTps?,
 * latencyTtftSec?, source?, lastVerified?, note? }`. `defaults` supplies the
 * fallback `source`/`note`/`lastVerified` (the snapshot's top level for T41; the
 * feed name for the live T45 source). Fail-safe: no vendor/id, no source, or no
 * usable number → null (nothing is invented, nothing mis-attributed). Shared by
 * the curated-snapshot adapter (T41) and the live Artificial Analysis source (T45),
 * so both paths emit an identical shape.
 */
export function benchmarkDraft(m, defaults = {}) {
  if (!m || typeof m !== "object" || !m.vendor || !m.id) return null;
  const source = m.source || defaults.source;
  if (!source) return null; // never emit an un-sourced number
  const note = m.note || defaults.note || "Cited third-party benchmark — verify at the source.";
  const lastVerified = m.lastVerified || defaults.lastVerified;

  const scores = scoresFrom(m.scores);
  const benchmarks = compact({
    intelligenceIndex: num(m.intelligenceIndex),
    arenaElo: num(m.arenaElo),
    scores,
    indicative: true, note, source, lastVerified,
  });
  const hasBenchmarks = benchmarks.intelligenceIndex !== undefined || benchmarks.arenaElo !== undefined || scores !== undefined;

  const performance = compact({
    throughputTps: num(m.throughputTps),
    latencyTtftSec: num(m.latencyTtftSec),
    indicative: true, note, source, lastVerified,
  });
  const hasPerformance = performance.throughputTps !== undefined || performance.latencyTtftSec !== undefined;

  if (!hasBenchmarks && !hasPerformance) return null;
  const draft = { vendor: String(m.vendor), id: String(m.id) };
  if (hasBenchmarks) draft.benchmarks = benchmarks;
  if (hasPerformance) draft.performance = performance;
  return draft;
}

export default {
  id: "benchmarks",
  vendor: null, // multi-vendor enrichment source — never introduces an id
  envKey: null, // curated local snapshot, no auth / no network
  label: "Cited capability benchmarks (curated snapshot)",

  // Read the committed snapshot; absent → skipped (opt-in), same online or offline.
  async fetch(_env, _ctx) {
    if (!existsSync(BENCHMARKS_FILE)) return null;
    return { raw: readJson(BENCHMARKS_FILE), fromCache: true };
  },

  // Snapshot shape: { source, sourceUrl?, lastVerified, models: [ { vendor, id,
  // intelligenceIndex?, arenaElo?, scores?, throughputTps?, latencyTtftSec?,
  // source?, lastVerified?, note? } ] }. Per-model `source`/`lastVerified` override
  // the top-level default (a model may be cited from a different leaderboard). Every
  // number is a reference to the source, never ours. Emits a `benchmarks` object
  // (T40/T42) and/or a `performance` object (T43) — a draft with neither is dropped.
  normalize(raw) {
    if (!raw || typeof raw !== "object") return [];
    const models = Array.isArray(raw.models) ? raw.models : [];
    const defaults = { source: raw.source, note: raw.note, lastVerified: raw.lastVerified };
    return models.map((m) => benchmarkDraft(m, defaults)).filter(Boolean);
  },
};
