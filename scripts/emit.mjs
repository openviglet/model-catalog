/**
 * Emits the PUBLIC model catalog artifacts from this repo's single source of
 * truth — `catalog/model-catalog.json` (the enriched envelope). Validates the
 * source structurally (zero-dep, no ajv), flattens each vendor's entries adding a
 * `vendor` field, and writes the published JSON + a pinned version copy + the
 * JSON Schema into `public/` for GitHub Pages to serve at the site root
 * (`<pages>/catalog.json`, `catalog-v1.json`, `catalog.schema.json`, the compact
 * `index.json`, faceted `by-kind/<KIND>.json` + `by-vendor/<vendor>.json` slices,
 * and the `endpoints.json` discovery manifest; see .github/workflows/publish.yml).
 * The browsable `public/index.html` sits at `<pages>/`.
 *
 *   node scripts/emit.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");
const SRC = resolve(REPO_ROOT, "catalog/model-catalog.json");
const SCHEMA_SRC = resolve(REPO_ROOT, "catalog/model-catalog.schema.json");
const OUT_DIR = resolve(REPO_ROOT, "public");
// Public base URL — the GitHub Pages site for this repo. The endpoint intentionally
// stays on this public host (a community-owned home, not a brand asset); the
// CATALOG_SOURCE_URL env only exists so an alternate deployment can override it.
const SOURCE_URL = process.env.CATALOG_SOURCE_URL || "https://openviglet.github.io/model-catalog";

const KINDS = new Set([
  "CHAT", "EMBEDDING", "RERANK", "IMAGE",
  "TRANSCRIPTION", "SPEECH", "VIDEO", "MODERATION", "UNKNOWN",
]);

// Additive lifecycle stages (Block BD / T764). Optional; absent for hand entries.
const STATUSES = new Set(["PREVIEW", "GA", "DEPRECATED", "RETIRED"]);

function fail(msg) {
  console.error(`emit-model-catalog: ${msg}`);
  process.exit(1);
}

const root = JSON.parse(readFileSync(SRC, "utf8"));

if (typeof root.version !== "number") fail("source missing integer `version`");
if (typeof root.lastUpdated !== "string") fail("source missing `lastUpdated`");
if (typeof root.vendors !== "object" || root.vendors === null) fail("source missing `vendors` object");

// Validate + flatten (add `vendor` to each entry).
const vendors = {};
let count = 0;
for (const [vendor, entries] of Object.entries(root.vendors)) {
  if (!Array.isArray(entries)) fail(`vendor "${vendor}" is not an array`);
  vendors[vendor] = entries.map((e, i) => {
    const where = `${vendor}[${i}]`;
    if (!e.id || typeof e.id !== "string") fail(`${where} missing string \`id\``);
    if (!e.label || typeof e.label !== "string") fail(`${where} (${e.id}) missing \`label\``);
    if (!KINDS.has(e.kind)) fail(`${where} (${e.id}) has invalid kind "${e.kind}"`);
    // Additive fields (Block BD / T764) — optional; validate only when present.
    if (e.status !== undefined && !STATUSES.has(e.status)) fail(`${where} (${e.id}) has invalid status "${e.status}"`);
    if (e.maxOutputTokens !== undefined && !(Number.isInteger(e.maxOutputTokens) && e.maxOutputTokens >= 1)) fail(`${where} (${e.id}) has invalid maxOutputTokens`);
    if (e.aliases !== undefined && !Array.isArray(e.aliases)) fail(`${where} (${e.id}) \`aliases\` must be an array`);
    if (e.sources !== undefined && !Array.isArray(e.sources)) fail(`${where} (${e.id}) \`sources\` must be an array`);
    if (e.modalities !== undefined && (typeof e.modalities !== "object" || e.modalities === null || Array.isArray(e.modalities))) fail(`${where} (${e.id}) \`modalities\` must be an object`);
    count++;
    return { ...e, vendor };
  });
}

const published = {
  $schema: `${SOURCE_URL}/catalog.schema.json`,
  version: root.version,
  lastUpdated: root.lastUpdated,
  source: SOURCE_URL,
  vendors,
};

// Compact index (T7): the same envelope shape, but each entry trimmed to just
// identity + kind. A model-picker that only renders a grouped dropdown fetches a
// fraction of the payload and lazy-loads the full record from catalog.json when a
// model is selected. Trimmed entries remain valid `ModelEntry`s (the dropped
// fields are all optional), so `index.json` validates against the same schema.
const index = {
  version: root.version,
  lastUpdated: root.lastUpdated,
  source: SOURCE_URL,
  vendors: Object.fromEntries(
    Object.entries(vendors).map(([vendor, entries]) => [
      vendor,
      entries.map((e) => ({ vendor, id: e.id, label: e.label, kind: e.kind })),
    ]),
  ),
};

// Faceted static slices (T8): pre-filtered views so a consumer fetches exactly the
// facet it wants — CDN-cached, no runtime — instead of downloading the whole catalog
// and filtering client-side. Every slice keeps the same `vendors`-map envelope as
// catalog.json (with the same optional narrowing key added), so one parser reads them
// all, and each slice validates against the same schema.
const slice = (extra, pick) => ({
  version: root.version,
  lastUpdated: root.lastUpdated,
  source: SOURCE_URL,
  ...extra,
  vendors: Object.fromEntries(
    Object.entries(vendors)
      .map(([vendor, entries]) => [vendor, entries.filter(pick)])
      .filter(([, entries]) => entries.length),
  ),
});

const presentKinds = [...KINDS].filter((k) =>
  Object.values(vendors).some((entries) => entries.some((e) => e.kind === k)),
);
const byKind = Object.fromEntries(
  presentKinds.map((k) => [k, slice({ kind: k }, (e) => e.kind === k)]),
);
const byVendor = Object.fromEntries(
  Object.keys(vendors).map((v) => [v, slice({ vendor: v }, (e) => e.vendor === v)]),
);

// Discovery manifest (T8): a machine-readable index of every published path (absolute
// URLs off SOURCE_URL) so consumers discover the surface instead of hard-coding it.
const endpoints = {
  version: root.version,
  lastUpdated: root.lastUpdated,
  source: SOURCE_URL,
  latest: `${SOURCE_URL}/catalog.json`,
  pinned: { [String(root.version)]: `${SOURCE_URL}/catalog-v${root.version}.json` },
  index: `${SOURCE_URL}/index.json`,
  stats: `${SOURCE_URL}/stats.json`,
  changes: `${SOURCE_URL}/changes.json`,
  feed: `${SOURCE_URL}/feed.xml`,
  csv: `${SOURCE_URL}/catalog.csv`,
  ndjson: `${SOURCE_URL}/catalog.ndjson`,
  schema: `${SOURCE_URL}/catalog.schema.json`,
  byKind: Object.fromEntries(presentKinds.map((k) => [k, `${SOURCE_URL}/by-kind/${k}.json`])),
  byVendor: Object.fromEntries(Object.keys(vendors).map((v) => [v, `${SOURCE_URL}/by-vendor/${v}.json`])),
};

// Aggregate metrics (T24): a tiny pre-computed rollup — counts per vendor / kind /
// capability / modality, plus field-fill coverage and grand totals — so the site
// dashboard, the badge and coverage views read one number instead of re-aggregating
// the full catalog. Derived here at emit, so it can never drift from the artifact.
const flat = Object.values(vendors).flat();
const tally = (values) => { const m = {}; for (const k of values) { m[k] = (m[k] || 0) + 1; } return m; };
// Sort count maps by descending count then key, so the artifact is deterministic + diff-friendly.
const ranked = (map) => Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
const filled = (pred) => {
  let n = 0;
  for (const e of flat) if (pred(e)) n++;
  return { filled: n, rate: flat.length ? Math.round((n / flat.length) * 1e4) / 1e4 : 0 };
};
const stats = {
  version: root.version,
  lastUpdated: root.lastUpdated,
  source: SOURCE_URL,
  totals: {
    models: flat.length,
    vendors: Object.keys(vendors).length,
    kinds: presentKinds.length,
    capabilities: new Set(flat.flatMap((e) => e.capabilities || [])).size,
  },
  byVendor: ranked(tally(flat.map((e) => e.vendor))),
  byKind: Object.fromEntries(presentKinds.map((k) => [k, flat.filter((e) => e.kind === k).length])),
  byCapability: ranked(tally(flat.flatMap((e) => e.capabilities || []))),
  byInputModality: ranked(tally(flat.flatMap((e) => (e.modalities && e.modalities.input) || []))),
  byOutputModality: ranked(tally(flat.flatMap((e) => (e.modalities && e.modalities.output) || []))),
  coverage: {
    total: flat.length,
    fields: {
      contextWindow: filled((e) => e.contextWindow != null),
      maxOutputTokens: filled((e) => e.maxOutputTokens != null),
      embeddingDimensions: filled((e) => e.embeddingDimensions != null),
      capabilities: filled((e) => (e.capabilities || []).length > 0),
      modalities: filled((e) => e.modalities != null),
      knowledgeCutoff: filled((e) => e.knowledgeCutoff != null),
      releaseDate: filled((e) => e.releaseDate != null),
      aliases: filled((e) => (e.aliases || []).length > 0),
      status: filled((e) => e.status != null),
      sources: filled((e) => (e.sources || []).length > 0),
      lastVerified: filled((e) => e.lastVerified != null),
    },
  },
};

// ── Catalog change feed (T22) ─────────────────────────────────────────────
// The defining value of a reference is knowing *what changed*. Diff the freshly
// built catalog against the previously published one and emit `changes.json`
// (added / removed / lifecycle-changed ids for this run) plus an Atom `feed.xml`
// consumers can subscribe to. "Previous" resolves in order: the prior on-disk
// build if present (local iterative emits) → the live published catalog (CI
// fresh checkout — best-effort over the network, never fatal) → none (first
// publish, empty diff). Diff-at-emit keeps it zero-runtime and always consistent
// with the artifact it describes; the baseline lookup degrades cleanly offline.
const xmlEsc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

async function loadPrevious() {
  const prior = resolve(OUT_DIR, "catalog.json");
  if (existsSync(prior)) {
    try { return JSON.parse(readFileSync(prior, "utf8")); } catch { /* unreadable → try network */ }
  }
  if (process.env.CATALOG_EMIT_NO_FETCH) return null; // offline/deterministic emit
  try {
    const r = await fetch(`${SOURCE_URL}/catalog.json`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) return await r.json();
  } catch { /* offline / first publish / slow host — no baseline */ }
  return null;
}

const previous = await loadPrevious();
const prevFlat = previous && previous.vendors && typeof previous.vendors === "object"
  ? Object.entries(previous.vendors).flatMap(([vendor, es]) =>
      (Array.isArray(es) ? es : []).map((e) => ({ ...e, vendor })))
  : [];
const idKey = (e) => `${e.vendor}/${e.id}`;
const lifecycle = (e) => e.status ?? (e.deprecated ? "DEPRECATED" : null);
const newById = new Map(flat.map((e) => [idKey(e), e]));
const oldById = new Map(prevFlat.map((e) => [idKey(e), e]));
const brief = (e) => ({ vendor: e.vendor, id: e.id, kind: e.kind, label: e.label });
const added = [];
const removed = [];
const changed = [];
for (const [k, e] of newById) if (!oldById.has(k)) added.push(brief(e));
for (const [k, e] of oldById) if (!newById.has(k)) removed.push(brief(e));
for (const [k, e] of newById) {
  const o = oldById.get(k);
  if (!o) continue;
  const from = lifecycle(o);
  const to = lifecycle(e);
  if (from !== to) changed.push({ ...brief(e), from, to });
}
const byId = (a, b) => a.vendor.localeCompare(b.vendor) || a.id.localeCompare(b.id);
added.sort(byId);
removed.sort(byId);
changed.sort(byId);

const changes = {
  version: root.version,
  lastUpdated: root.lastUpdated,
  source: SOURCE_URL,
  previousLastUpdated: previous ? previous.lastUpdated ?? null : null,
  baseline: previous ? "present" : "none", // "none" ⇒ first publish, diff is empty by definition
  counts: { added: added.length, removed: removed.length, changed: changed.length },
  added,
  removed,
  changed,
};

// Atom 1.0 feed — one <entry> per change in this run. Timestamps derive from
// `lastUpdated` (no wall-clock read) so the feed is deterministic and diff-friendly.
const stamp = `${root.lastUpdated}T00:00:00Z`;
const feedEntry = (type, e) => {
  const title = type === "changed"
    ? `Lifecycle: ${e.vendor}/${e.id} · ${e.from ?? "unset"} → ${e.to ?? "unset"}`
    : `${type === "added" ? "Added" : "Removed"}: ${e.vendor}/${e.id}`;
  const summary = type === "changed"
    ? `${e.label} (${e.kind}) status ${e.from ?? "unset"} → ${e.to ?? "unset"}.`
    : `${e.label} (${e.kind}) ${type === "added" ? "added to" : "removed from"} the catalog.`;
  return `  <entry>
    <title>${xmlEsc(title)}</title>
    <id>${xmlEsc(`${SOURCE_URL}/feed.xml#${root.lastUpdated}-${type}-${e.vendor}-${e.id}`)}</id>
    <updated>${stamp}</updated>
    <link href="${xmlEsc(`${SOURCE_URL}/#${e.vendor}/${e.id}`)}"/>
    <category term="${xmlEsc(type)}"/>
    <summary>${xmlEsc(summary)}</summary>
  </entry>`;
};
const feedEntries = [
  ...added.map((e) => feedEntry("added", e)),
  ...removed.map((e) => feedEntry("removed", e)),
  ...changed.map((e) => feedEntry("changed", e)),
];
const feedXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Model Catalog — changes</title>
  <subtitle>Model additions, removals and lifecycle transitions, per publish.</subtitle>
  <id>${xmlEsc(`${SOURCE_URL}/feed.xml`)}</id>
  <link rel="self" href="${xmlEsc(`${SOURCE_URL}/feed.xml`)}"/>
  <link href="${xmlEsc(`${SOURCE_URL}/`)}"/>
  <updated>${stamp}</updated>
  <author><name>Model Catalog</name></author>
${feedEntries.length ? feedEntries.join("\n") + "\n" : ""}</feed>
`;

// ── Alternate export formats (T23) ────────────────────────────────────────
// Not every consumer wants nested JSON. `catalog.csv` (one flat row per model)
// serves spreadsheets / BI tools; `catalog.ndjson` (one JSON object per line)
// serves streaming, `jq -c` and `grep`. Both derive from the same flattened
// entries as catalog.json, in the same order, so they can never drift. Array
// fields are `;`-joined in CSV; modalities are split into input/output columns.
const CSV_COLUMNS = [
  "vendor", "id", "label", "kind", "contextWindow", "maxOutputTokens",
  "embeddingDimensions", "capabilities", "inputModalities", "outputModalities",
  "knowledgeCutoff", "releaseDate", "status", "deprecated", "aliases",
  "sources", "lastVerified",
];
const csvCell = (v) => {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join(";") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; // RFC 4180 quoting
};
const csvRow = (e) => CSV_COLUMNS.map((c) => {
  if (c === "inputModalities") return csvCell((e.modalities && e.modalities.input) || []);
  if (c === "outputModalities") return csvCell((e.modalities && e.modalities.output) || []);
  return csvCell(e[c]);
}).join(",");
const catalogCsv = [CSV_COLUMNS.join(","), ...flat.map(csvRow)].join("\r\n") + "\r\n";
const catalogNdjson = flat.map((e) => JSON.stringify(e)).join("\n") + "\n";

mkdirSync(OUT_DIR, { recursive: true });
// Rewrite the slice dirs from scratch so a removed kind/vendor leaves no stale file.
for (const dir of ["by-kind", "by-vendor"]) {
  rmSync(resolve(OUT_DIR, dir), { recursive: true, force: true });
  mkdirSync(resolve(OUT_DIR, dir), { recursive: true });
}
const write = (rel, obj) => writeFileSync(resolve(OUT_DIR, rel), JSON.stringify(obj, null, 2) + "\n", "utf8");

const json = JSON.stringify(published, null, 2) + "\n";
writeFileSync(resolve(OUT_DIR, "catalog.json"), json, "utf8"); // rolling latest
writeFileSync(resolve(OUT_DIR, `catalog-v${root.version}.json`), json, "utf8"); // pinned
writeFileSync(resolve(OUT_DIR, "catalog.schema.json"), readFileSync(SCHEMA_SRC, "utf8"), "utf8");
write("index.json", index); // compact
write("stats.json", stats); // aggregate metrics (T24)
write("changes.json", changes); // change feed (T22)
writeFileSync(resolve(OUT_DIR, "feed.xml"), feedXml, "utf8"); // Atom feed (T22)
writeFileSync(resolve(OUT_DIR, "catalog.csv"), catalogCsv, "utf8"); // flat export (T23)
writeFileSync(resolve(OUT_DIR, "catalog.ndjson"), catalogNdjson, "utf8"); // streaming export (T23)
for (const [k, v] of Object.entries(byKind)) write(`by-kind/${k}.json`, v);
for (const [k, v] of Object.entries(byVendor)) write(`by-vendor/${k}.json`, v);
write("endpoints.json", endpoints); // discovery manifest

console.log(
  `emit-model-catalog: wrote catalog.json + catalog-v${root.version}.json + schema + index.json + stats.json + ` +
    `changes.json + feed.xml + catalog.csv + catalog.ndjson + ${presentKinds.length} by-kind + ${Object.keys(byVendor).length} by-vendor slices + endpoints.json ` +
    `(${Object.keys(vendors).length} vendors, ${count} models) to ${OUT_DIR}`,
);
console.log(
  `emit-model-catalog: change feed (baseline: ${changes.baseline}) — ` +
    `${added.length} added, ${removed.length} removed, ${changed.length} lifecycle`,
);
