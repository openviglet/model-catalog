/*
 * Structured-RAG artifacts derived from the flat catalog entries, for a
 * vectorless / structured-data RAG consumer (e.g. Viglet Turing ES's catalog
 * copilot):
 *
 *   • query-manifest.json (T59) — a per-field descriptor over the FLATTENED
 *     record shape (nested objects expanded to `parent_child` keys, exactly as a
 *     structured-RAG ingester flattens `catalog.ndjson`): field name, type,
 *     facetable, multi-valued, enum value sets, numeric min–max, sortability and a
 *     human description. The contract an external structured/vectorless RAG
 *     declares its field schema from and constrains NL→filter against.
 *
 *   • context.txt (T60) — a compact, token-budgeted digest (one line per model
 *     with the decision fields) for the "no-retrieval, stuff the whole catalog"
 *     vectorless mode and as an assistant-ingestible GEO artifact.
 *
 * Pure + zero-dep (Node built-ins only); derived at emit so they can never drift
 * from the published catalog.
 */

/** Provenance/metadata leaves that are not useful query fields. */
const NOISE_SUFFIXES = ["_note", "_source", "_lastVerified", "_indicative", "_unit"];
const NOISE_EXACT = new Set(["lastVerified", "sources"]);
/** Fields treated as full-text rather than exact/faceted. */
const TEXT_FIELDS = new Set(["label"]);
/** Max distinct string values before a field stops being a facet (and its enum is dropped). */
const ENUM_MAX = 60;

const DESCRIPTIONS = {
  vendor: "Model vendor / provider.",
  kind: "Model kind (CHAT, EMBEDDING, RERANK, IMAGE, …).",
  label: "Human-readable model name.",
  contextWindow: "Maximum input context window, in tokens.",
  maxOutputTokens: "Maximum output tokens per response.",
  capabilities: "Declared capabilities (tools, vision, reasoning, …).",
  modalities_input: "Accepted input modalities (text, image, pdf, …).",
  modalities_output: "Produced output modalities.",
  pricing_inputPer1M: "Indicative input price per 1M tokens.",
  pricing_outputPer1M: "Indicative output price per 1M tokens.",
  pricing_currency: "Pricing currency.",
  benchmarks_intelligenceIndex: "Composite intelligence index (higher is better).",
  benchmarks_scores_coding_value: "Coding benchmark score.",
  performance_throughputTps: "Indicative throughput, tokens per second.",
  performance_latencyTtftSec: "Indicative time-to-first-token, seconds.",
  releaseDate: "Model release date (YYYY-MM-DD).",
  status: "Lifecycle status (PREVIEW, GA, DEPRECATED, RETIRED).",
  aliases: "Alternate ids this model is also known by.",
};

/**
 * Flatten one record the same way a structured-RAG ingester does: nested objects
 * become `parent_child` keys (recursively); arrays of scalars are preserved;
 * arrays of objects and blank strings are dropped.
 */
export function flattenRecord(entry) {
  const out = {};
  const add = (key, value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      const scalars = value.filter((v) => v !== null && v !== undefined && typeof v !== "object");
      if (scalars.length > 0) out[key] = scalars;
      return;
    }
    if (typeof value === "object") {
      for (const [ck, cv] of Object.entries(value)) add(`${key}_${ck}`, cv);
      return;
    }
    if (typeof value === "string" && value.trim() === "") return;
    out[key] = value;
  };
  for (const [k, v] of Object.entries(entry)) add(k, v);
  return out;
}

function isNoise(key) {
  return NOISE_EXACT.has(key) || NOISE_SUFFIXES.some((s) => key.endsWith(s));
}

/**
 * Build the query manifest from the flat catalog entries.
 * @param {object[]} flat  flattened vendor entries (each already carries `vendor`)
 * @param {object} opts    { source, schemaVersion, generatedAt, idField }
 */
export function buildQueryManifest(flat, opts = {}) {
  const idField = opts.idField || "id";
  const agg = new Map();
  for (const entry of flat) {
    const record = flattenRecord(entry);
    for (const [key, value] of Object.entries(record)) {
      if (key === idField || isNoise(key)) continue;
      const values = Array.isArray(value) ? value : [value];
      let a = agg.get(key);
      if (!a) {
        a = { array: Array.isArray(value), hasNumber: false, hasBool: false, hasString: false,
              strings: new Set(), min: Infinity, max: -Infinity, allInt: true };
        agg.set(key, a);
      }
      if (Array.isArray(value)) a.array = true;
      for (const v of values) {
        if (typeof v === "number") {
          a.hasNumber = true;
          a.min = Math.min(a.min, v);
          a.max = Math.max(a.max, v);
          if (!Number.isInteger(v)) a.allInt = false;
        } else if (typeof v === "boolean") {
          a.hasBool = true;
        } else if (typeof v === "string") {
          a.hasString = true;
          if (a.strings.size <= ENUM_MAX) a.strings.add(v);
        }
      }
    }
  }

  const fields = [...agg.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([name, a]) => describeField(name, a));

  return {
    schemaVersion: opts.schemaVersion || "1",
    generatedAt: opts.generatedAt || null,
    source: opts.source || null,
    recordCount: flat.length,
    idField,
    fields,
  };
}

function describeField(name, a) {
  const field = { name, description: DESCRIPTIONS[name] || humanize(name) };
  if (a.hasNumber && !a.hasString && !a.hasBool) {
    field.type = a.allInt ? "INT" : "DOUBLE";
    field.facet = false;
    field.multiValued = a.array;
    field.mandatory = false;
    field.sortable = true;
    if (Number.isFinite(a.min)) field.min = a.min;
    if (Number.isFinite(a.max)) field.max = a.max;
    return field;
  }
  if (a.hasBool && !a.hasString && !a.hasNumber) {
    field.type = "BOOL";
    field.facet = true;
    field.multiValued = a.array;
    field.mandatory = false;
    return field;
  }
  // string (or mixed → treat as string/text)
  const isText = TEXT_FIELDS.has(name);
  field.type = isText ? "TEXT" : "STRING";
  field.multiValued = a.array;
  field.mandatory = false;
  field.facet = !isText && a.strings.size > 0 && a.strings.size <= ENUM_MAX;
  if (field.facet) {
    field.enum = [...a.strings].sort();
  }
  return field;
}

function humanize(key) {
  return `The ${key.replace(/_/g, " ")} field.`;
}

// ── context.txt (T60) ──────────────────────────────────────────────────────

const num = (v) => (typeof v === "number" ? String(v) : null);

/**
 * Build the token-budgeted stuff-all digest: a caption + one line per model with
 * the decision fields, sorted by vendor then id for stable output.
 * @param {object[]} flat  flattened vendor entries
 * @param {object} opts    { source, lastUpdated }
 */
export function buildContextTxt(flat, opts = {}) {
  const header = [
    "# Model Catalog — decision digest",
    opts.lastUpdated ? `# lastUpdated: ${opts.lastUpdated}` : null,
    opts.source ? `# source: ${opts.source}` : null,
    "# One line per model. Prices/benchmarks are INDICATIVE — verify with the vendor.",
    "# Columns: id [vendor/kind] ctx=<contextTokens> out=<maxOutputTokens>"
      + " in$=<inputPer1M> out$=<outputPer1M> II=<intelligenceIndex>"
      + " caps=<capabilities> in=<inputModalities>",
    "",
  ].filter(Boolean);

  const lines = [...flat]
    .sort((x, y) => (x.vendor || "").localeCompare(y.vendor || "") || (x.id || "").localeCompare(y.id || ""))
    .map((e) => modelLine(e));

  return header.concat(lines).join("\n") + "\n";
}

function modelLine(e) {
  const parts = [`- ${e.id} [${e.vendor}/${e.kind}]`];
  const ctx = num(e.contextWindow);
  if (ctx) parts.push(`ctx=${ctx}`);
  const out = num(e.maxOutputTokens);
  if (out) parts.push(`out=${out}`);
  const inPrice = num(e.pricing?.inputPer1M);
  const outPrice = num(e.pricing?.outputPer1M);
  if (inPrice !== null || outPrice !== null) {
    parts.push(`in$=${inPrice ?? "?"} out$=${outPrice ?? "?"}`);
  }
  const ii = num(e.benchmarks?.intelligenceIndex);
  if (ii) parts.push(`II=${ii}`);
  if (Array.isArray(e.capabilities) && e.capabilities.length) {
    parts.push(`caps=${e.capabilities.join(",")}`);
  }
  const inputModalities = e.modalities?.input;
  if (Array.isArray(inputModalities) && inputModalities.length) {
    parts.push(`in=${inputModalities.join(",")}`);
  }
  return parts.join(" ");
}
