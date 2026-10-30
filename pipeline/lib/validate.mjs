/**
 * Validation + diff-report review gate (Block BD / T769). Structurally validates
 * the proposed envelope against the catalog schema's constraints (reusing the
 * same rules as emit-model-catalog.mjs) and renders a human-readable diff report
 * vs. the committed file with per-field source attribution + conflict flags.
 *
 * @since 2026.3.4 (T769)
 */
import { KINDS } from "./util.mjs";

const STATUSES = new Set(["PREVIEW", "GA", "DEPRECATED", "RETIRED"]);

/**
 * Shared provenance core for the CITED value objects (`pricing` Block F / T30,
 * `benchmarks` Block I / T40, `performance` Block I / T43). Each is admitted only
 * with `indicative: true`, a `source` and a `lastVerified`; its listed numeric
 * fields, when present, are non-negative. Field-specific extras (currency, scores)
 * are checked by the callers. `label` names the field in the error text.
 * @returns string[] of errors (empty = valid).
 */
function citedCoreErrors(o, at, label, numericFields) {
  if (typeof o !== "object" || o === null || Array.isArray(o)) return [`${at} ${label} is not an object`];
  const errs = [];
  if (o.indicative !== true) errs.push(`${at} ${label}.indicative must be true`);
  if (!o.source || typeof o.source !== "string") errs.push(`${at} ${label} missing string source`);
  if (typeof o.lastVerified !== "string") errs.push(`${at} ${label} missing string lastVerified`);
  for (const nf of numericFields) {
    if (o[nf] !== undefined && !(typeof o[nf] === "number" && o[nf] >= 0)) errs.push(`${at} invalid ${label}.${nf}`);
  }
  return errs;
}

/** Structural mirror of $defs/pricing (Block F / T30). Indicative US list price. */
function pricingErrors(p, at) {
  const errs = citedCoreErrors(p, at, "pricing", ["inputPer1M", "outputPer1M"]);
  if (typeof p === "object" && p !== null && !Array.isArray(p) && p.currency !== undefined && p.currency !== "USD") {
    errs.push(`${at} pricing.currency must be USD`);
  }
  return errs;
}

/** Structural mirror of $defs/benchmarks (Block I / T40, T42). Cited capability index. */
function benchmarksErrors(b, at) {
  const errs = citedCoreErrors(b, at, "benchmarks", ["intelligenceIndex", "arenaElo"]);
  if (typeof b !== "object" || b === null || Array.isArray(b)) return errs;
  // Per-domain scores (T42): a map of domain → { value, source?, lastVerified? }.
  if (b.scores !== undefined) {
    if (typeof b.scores !== "object" || b.scores === null || Array.isArray(b.scores)) {
      errs.push(`${at} benchmarks.scores is not an object`);
    } else {
      for (const [domain, s] of Object.entries(b.scores)) {
        if (typeof s !== "object" || s === null || Array.isArray(s)) { errs.push(`${at} benchmarks.scores.${domain} is not an object`); continue; }
        if (!(typeof s.value === "number" && s.value >= 0)) errs.push(`${at} invalid benchmarks.scores.${domain}.value`);
      }
    }
  }
  return errs;
}

/** Structural mirror of $defs/performance (Block I / T43). Cited speed metrics. */
function performanceErrors(p, at) {
  return citedCoreErrors(p, at, "performance", ["throughputTps", "latencyTtftSec"]);
}

/** @returns string[] of validation errors (empty = valid). */
export function validateEnvelope(env) {
  const errs = [];
  if (!Number.isInteger(env?.version) || env.version < 1) errs.push("missing/invalid integer `version`");
  if (typeof env?.lastUpdated !== "string") errs.push("missing string `lastUpdated`");
  if (typeof env?.vendors !== "object" || env.vendors === null) errs.push("missing `vendors` object");
  for (const [vendor, entries] of Object.entries(env?.vendors || {})) {
    if (!Array.isArray(entries)) { errs.push(`vendor "${vendor}" is not an array`); continue; }
    const ids = new Set();
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const at = `${vendor}[${i}]`;
      if (!e?.id || typeof e.id !== "string") { errs.push(`${at} missing string id`); continue; }
      if (ids.has(e.id)) errs.push(`${at} duplicate id "${e.id}"`);
      ids.add(e.id);
      if (!e.label || typeof e.label !== "string") errs.push(`${at} (${e.id}) missing label`);
      if (!KINDS.has(e.kind)) errs.push(`${at} (${e.id}) invalid kind "${e.kind}"`);
      if (e.status !== undefined && !STATUSES.has(e.status)) errs.push(`${at} (${e.id}) invalid status "${e.status}"`);
      for (const nf of ["contextWindow", "maxOutputTokens", "embeddingDimensions", "parameters"]) {
        if (e[nf] !== undefined && !(Number.isInteger(e[nf]) && e[nf] >= 1)) errs.push(`${at} (${e.id}) invalid ${nf}`);
      }
      if (e.openWeights !== undefined && typeof e.openWeights !== "boolean") errs.push(`${at} (${e.id}) openWeights must be boolean`);
      if (e.pricing !== undefined) errs.push(...pricingErrors(e.pricing, `${at} (${e.id})`));
      if (e.benchmarks !== undefined) errs.push(...benchmarksErrors(e.benchmarks, `${at} (${e.id})`));
      if (e.performance !== undefined) errs.push(...performanceErrors(e.performance, `${at} (${e.id})`));
    }
  }
  return errs;
}

const CMP_FIELDS = [
  "label", "kind", "contextWindow", "maxOutputTokens", "embeddingDimensions",
  "capabilities", "openWeights", "parameters", "modalities", "knowledgeCutoff",
  "releaseDate", "aliases", "status", "deprecated", "pricing", "benchmarks", "performance",
];

function fmt(v) {
  if (v === undefined) return "∅";
  if (Array.isArray(v)) return `[${v.join(", ")}]`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function eq(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Render the diff report as text (never writes anything).
 * @returns { text, stats } stats = { added, removed, changed, conflicts, skipped }
 */
export function diffReport(existing, proposed, meta = {}, skipped = []) {
  const lines = [];
  const stats = { added: 0, removed: 0, changed: 0, conflicts: 0, skipped: skipped.length };
  const vendors = [...new Set([...Object.keys(existing?.vendors || {}), ...Object.keys(proposed?.vendors || {})])].sort();

  for (const vendor of vendors) {
    const oldE = new Map((existing?.vendors?.[vendor] || []).map((e) => [e.id, e]));
    const newE = new Map((proposed?.vendors?.[vendor] || []).map((e) => [e.id, e]));
    const section = [];

    for (const [id, e] of newE) {
      if (oldE.has(id)) continue;
      stats.added++;
      section.push(`  + ADD ${id} (${e.kind}) — sources: ${(e.sources || []).join(", ") || "?"}`);
    }
    for (const [id] of oldE) {
      if (!newE.has(id)) { stats.removed++; section.push(`  - REMOVE ${id}`); }
    }
    for (const [id, ne] of newE) {
      const oe = oldE.get(id);
      if (!oe) continue;
      const changes = [];
      for (const f of CMP_FIELDS) {
        if (!eq(oe[f], ne[f])) {
          const src = meta[`${vendor}::${id}`]?.fieldProvenance?.[f];
          changes.push(`      · ${f}: ${fmt(oe[f])} → ${fmt(ne[f])}${src ? ` [${src}]` : ""}`);
        }
      }
      const conflicts = meta[`${vendor}::${id}`]?.conflicts || [];
      // Only a moved field counts as a change (T91); a standing source conflict is
      // listed under its own header so a no-op re-run reads `changed: 0`.
      if (changes.length) stats.changed++;
      if (changes.length || conflicts.length) {
        section.push(changes.length ? `  ~ CHANGE ${id}` : `  ! CONFLICT ${id}`);
        section.push(...changes);
        for (const c of conflicts) {
          stats.conflicts++;
          const losers = c.losers.map((l) => `${fmt(l.value)}@${l.source}`).join(", ");
          section.push(`      ⚠ conflict on ${c.field}: kept ${fmt(c.winner.value)}@${c.winner.source} over ${losers}`);
        }
      }
    }

    if (section.length) {
      lines.push(`\n[${vendor}] (${newE.size} models)`);
      lines.push(...section);
    }
  }

  if (skipped.length) {
    lines.push(`\n[skipped] ${skipped.length} id(s) not admitted (anchoring rule):`);
    for (const s of skipped.slice(0, 50)) lines.push(`  · ${s.vendor}/${s.id} — ${s.reason}`);
    if (skipped.length > 50) lines.push(`  … and ${skipped.length - 50} more`);
  }

  const header =
    `Model catalog diff — proposed vs committed\n` +
    `  added: ${stats.added}  removed: ${stats.removed}  changed: ${stats.changed}` +
    `  conflicts: ${stats.conflicts}  skipped: ${stats.skipped}`;

  return { text: header + "\n" + (lines.length ? lines.join("\n") : "\n(no differences)") + "\n", stats };
}

/**
 * Live-evidence coverage of a run (T87): which vendors a full live listing vouched
 * for, which were carried forward from the committed catalog without one (so no id
 * of theirs could be removed), and which vendor sources did not run and why.
 *
 * @param vendors  proposed envelope's vendors map
 * @param liveVendors Set of vendors a full live listing ran for
 * @param notRun   [{ id, vendor, reason }] vendor sources that did not run
 * @returns text block (never writes anything)
 */
export function evidenceSummary(vendors, liveVendors, notRun) {
  const counted = (v) => `${v} (${vendors[v].length})`;
  const all = Object.keys(vendors).sort();
  const live = all.filter((v) => liveVendors.has(v));
  const carried = all.filter((v) => !liveVendors.has(v));
  const lines = [
    "Live evidence coverage",
    `  live listing (removal evidence): ${live.map(counted).join(", ") || "none"}`,
    `  carried forward without live evidence: ${carried.map(counted).join(", ") || "none"}`,
  ];
  if (notRun.length) {
    lines.push("  vendor sources that did not run:");
    for (const s of notRun) lines.push(`    · ${s.id} (${s.vendor}) — ${s.reason}`);
  }
  return lines.join("\n") + "\n";
}
