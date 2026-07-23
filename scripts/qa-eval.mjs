/*
 * Grounded-answer eval set (T62) — parse + validation for `catalog/qa-eval.jsonl`.
 *
 * The eval set is a small, committed list of `question → expected model id(s) /
 * expected filter` cases. It does double duty:
 *   • seeds the "Ask the catalog" widget's example prompts (entries flagged
 *     `example: true`), and
 *   • is a DRIFT CHECK — every referenced `vendor/id` must still resolve to a
 *     catalog entry, and every structured filter must reference a field the
 *     query-manifest (T59) actually declares — so as the catalog changes we can
 *     tell whether "cheapest long-context embedding" still points at real rows.
 *     Runnable locally / in CI, or fed to Turing's `nl-facet-eval` harness.
 *
 * Pure + zero-dep (Node built-ins only). Two error classes are reported
 * separately so callers can treat them differently: STRUCTURAL errors (malformed
 * eval file — always fatal) vs DRIFT warnings (an id/filter no longer resolves —
 * fatal in the test, a warning at emit so a legit catalog change never blocks a
 * publish over a stale eval anchor).
 */

const KEY = (e) => `${e.vendor}/${e.id}`;
/** Filter keys that are constraints rather than the `sort` directive. */
const CONSTRAINT_KEYS = new Set(["kind", "openWeights", "capabilities"]);

/**
 * Parse JSONL text into an array of `{ line, entry }`. Blank lines and lines
 * whose first non-space char is `#` (comments) are skipped. Throws with the
 * 1-based line number on malformed JSON.
 */
export function parseQaEval(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch (err) {
      throw new Error(`qa-eval.jsonl line ${i + 1}: invalid JSON — ${err.message}`);
    }
    out.push({ line: i + 1, entry });
  }
  return out;
}

/**
 * Validate parsed eval entries against the live catalog + query manifest.
 * @param {{line:number, entry:object}[]} parsed  from parseQaEval
 * @param {object} ctx  { flat, manifest } — flattened catalog entries (each with
 *                       `vendor`) and the T59 query-manifest object.
 * @returns {{ structural: string[], drift: string[], exampleCount: number }}
 */
export function validateQaEval(parsed, ctx = {}) {
  const flat = ctx.flat || [];
  const manifest = ctx.manifest || { fields: [] };
  const structural = [];
  const drift = [];
  let exampleCount = 0;

  const catalogKeys = new Set(flat.map(KEY));
  const byKey = new Map(flat.map((e) => [KEY(e), e]));
  const fieldByName = new Map((manifest.fields || []).map((f) => [f.name, f]));
  const kindField = fieldByName.get("kind");
  const kindEnum = new Set((kindField && kindField.enum) || []);
  const seenIds = new Set();

  for (const { line, entry } of parsed) {
    const at = `qa-eval.jsonl line ${line}`;
    if (typeof entry.id !== "string" || entry.id.trim() === "") {
      structural.push(`${at}: missing string \`id\` (a stable case slug)`);
    } else if (seenIds.has(entry.id)) {
      structural.push(`${at}: duplicate case id "${entry.id}"`);
    } else {
      seenIds.add(entry.id);
    }
    if (typeof entry.question !== "string" || entry.question.trim() === "") {
      structural.push(`${at}: missing non-empty \`question\``);
    }
    if (entry.example === true) exampleCount++;

    const expect = entry.expect;
    if (typeof expect !== "object" || expect === null) {
      structural.push(`${at}: missing \`expect\` object`);
      continue;
    }
    const hasIds = Array.isArray(expect.ids) && expect.ids.length > 0;
    const hasFilter = typeof expect.filter === "object" && expect.filter !== null;
    if (!hasIds && !hasFilter) {
      structural.push(`${at}: \`expect\` must carry \`ids\` and/or a \`filter\``);
    }

    // Filter references must be real query-manifest fields (the T59 contract).
    let filterKind = null;
    let filterOpenWeights = null;
    let filterCaps = [];
    if (hasFilter) {
      const f = expect.filter;
      for (const [k, v] of Object.entries(f)) {
        if (k === "sort") {
          if (typeof v !== "string" || !/^[^:]+:(asc|desc)$/.test(v)) {
            structural.push(`${at}: \`filter.sort\` must be "<field>:asc|desc" (got ${JSON.stringify(v)})`);
            continue;
          }
          const field = v.split(":")[0];
          const decl = fieldByName.get(field);
          if (!decl) drift.push(`${at}: sort field "${field}" is not in the query manifest`);
          else if (decl.sortable !== true) structural.push(`${at}: sort field "${field}" is not sortable`);
          continue;
        }
        if (!CONSTRAINT_KEYS.has(k)) {
          structural.push(`${at}: unknown filter key "${k}" (allowed: ${[...CONSTRAINT_KEYS].join(", ")}, sort)`);
          continue;
        }
        if (!fieldByName.has(k)) {
          drift.push(`${at}: filter field "${k}" is not in the query manifest`);
        }
        if (k === "kind") {
          filterKind = v;
          if (kindEnum.size && !kindEnum.has(v)) drift.push(`${at}: kind "${v}" is not a catalog kind`);
        } else if (k === "openWeights") {
          filterOpenWeights = v;
        } else if (k === "capabilities") {
          if (!Array.isArray(v)) structural.push(`${at}: filter.capabilities must be an array`);
          else filterCaps = v;
        }
      }
    }

    // Drift: every expected id must resolve, and must satisfy the filter it is
    // the expected answer to (so the eval can't quietly become self-contradictory).
    if (hasIds) {
      for (const id of expect.ids) {
        if (typeof id !== "string") { structural.push(`${at}: \`ids\` entries must be "vendor/id" strings`); continue; }
        if (!catalogKeys.has(id)) { drift.push(`${at}: expected id "${id}" is not in the catalog`); continue; }
        const m = byKey.get(id);
        if (filterKind && m.kind !== filterKind) drift.push(`${at}: "${id}" is kind ${m.kind}, not ${filterKind}`);
        if (filterOpenWeights != null && m.openWeights !== filterOpenWeights) drift.push(`${at}: "${id}" openWeights=${m.openWeights} ≠ ${filterOpenWeights}`);
        for (const cap of filterCaps) {
          if (!(m.capabilities || []).includes(cap)) drift.push(`${at}: "${id}" lacks capability "${cap}"`);
        }
      }
    }
  }

  return { structural, drift, exampleCount };
}
