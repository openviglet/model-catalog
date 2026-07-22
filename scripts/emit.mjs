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
const PLANS_SRC = resolve(REPO_ROOT, "catalog/plans.json"); // consumer plans dataset (T33)
const PLANS_SCHEMA_SRC = resolve(REPO_ROOT, "catalog/plans.schema.json");
const PROVIDERS_SRC = resolve(REPO_ROOT, "catalog/providers.json"); // pricing-source registry (T35)
const PROVIDERS_SCHEMA_SRC = resolve(REPO_ROOT, "catalog/providers.schema.json");
const CLIENT_JS_SRC = resolve(REPO_ROOT, "clients/js/index.js"); // the JS SDK the page dogfoods (T50)
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

// Consumer subscription plans (T33): a SEPARATE dataset (plans are not models) —
// vendor consumer tiers (Claude Pro/Max, ChatGPT Plus/Pro, Gemini / Google AI
// Pro/Ultra) with an INDICATIVE US list price each. Optional: absent → not
// published. Hand-curated + reviewed (no upstream API), provenance-gated. Flattened
// like the catalog (a `vendor` key added per plan) for consumer convenience.
let plansPublished = null;
let plansCount = 0;
if (existsSync(PLANS_SRC)) {
  const plansRoot = JSON.parse(readFileSync(PLANS_SRC, "utf8"));
  if (typeof plansRoot.version !== "number") fail("plans.json missing integer `version`");
  if (typeof plansRoot.lastUpdated !== "string") fail("plans.json missing `lastUpdated`");
  if (typeof plansRoot.plans !== "object" || plansRoot.plans === null) fail("plans.json missing `plans` object");
  const plans = {};
  for (const [vendor, entries] of Object.entries(plansRoot.plans)) {
    if (!Array.isArray(entries)) fail(`plans vendor "${vendor}" is not an array`);
    const ids = new Set();
    plans[vendor] = entries.map((p, i) => {
      const where = `plans.${vendor}[${i}]`;
      if (!p.id || typeof p.id !== "string") fail(`${where} missing string \`id\``);
      if (ids.has(p.id)) fail(`${where} duplicate id "${p.id}"`);
      ids.add(p.id);
      if (!p.name || typeof p.name !== "string") fail(`${where} (${p.id}) missing \`name\``);
      if (p.indicative !== true) fail(`${where} (${p.id}) \`indicative\` must be true`);
      if (!p.source || typeof p.source !== "string") fail(`${where} (${p.id}) missing string \`source\` (never invented)`);
      if (typeof p.lastVerified !== "string") fail(`${where} (${p.id}) missing string \`lastVerified\``);
      for (const nf of ["priceMonthlyUSD", "annualMonthlyUSD"]) {
        if (p[nf] !== undefined && !(typeof p[nf] === "number" && p[nf] >= 0)) fail(`${where} (${p.id}) invalid ${nf}`);
      }
      if (p.currency !== undefined && p.currency !== "USD") fail(`${where} (${p.id}) \`currency\` must be USD`);
      plansCount++;
      return { ...p, vendor };
    });
  }
  plansPublished = {
    $schema: `${SOURCE_URL}/plans.schema.json`,
    version: plansRoot.version,
    lastUpdated: plansRoot.lastUpdated,
    source: SOURCE_URL,
    disclaimer: plansRoot.disclaimer,
    plans,
  };
}

// Provider pricing-source registry (T35): official pricing pages to VERIFY the
// catalog's indicative prices against — URLs only, no prices. Optional: absent →
// not published. Hand-curated + reviewed.
let providersPublished = null;
let providersCount = 0;
if (existsSync(PROVIDERS_SRC)) {
  const provRoot = JSON.parse(readFileSync(PROVIDERS_SRC, "utf8"));
  if (typeof provRoot.version !== "number") fail("providers.json missing integer `version`");
  if (typeof provRoot.lastUpdated !== "string") fail("providers.json missing `lastUpdated`");
  if (!Array.isArray(provRoot.providers)) fail("providers.json `providers` must be an array");
  const CATEGORIES = new Set(["model-creator", "hyperscaler", "inference-provider", "aggregator"]);
  const seen = new Set();
  for (let i = 0; i < provRoot.providers.length; i++) {
    const p = provRoot.providers[i];
    const where = `providers[${i}]`;
    if (!p.id || typeof p.id !== "string") fail(`${where} missing string \`id\``);
    if (seen.has(p.id)) fail(`${where} duplicate id "${p.id}"`);
    seen.add(p.id);
    if (!p.name || typeof p.name !== "string") fail(`${where} (${p.id}) missing \`name\``);
    if (!CATEGORIES.has(p.category)) fail(`${where} (${p.id}) invalid category "${p.category}"`);
    providersCount++;
  }
  providersPublished = {
    $schema: `${SOURCE_URL}/providers.schema.json`,
    version: provRoot.version,
    lastUpdated: provRoot.lastUpdated,
    source: SOURCE_URL,
    disclaimer: provRoot.disclaimer,
    providers: provRoot.providers,
  };
}

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

const flat = Object.values(vendors).flat();

const presentKinds = [...KINDS].filter((k) =>
  Object.values(vendors).some((entries) => entries.some((e) => e.kind === k)),
);
const byKind = Object.fromEntries(
  presentKinds.map((k) => [k, slice({ kind: k }, (e) => e.kind === k)]),
);
const byVendor = Object.fromEntries(
  Object.keys(vendors).map((v) => [v, slice({ vendor: v }, (e) => e.vendor === v)]),
);

// Extended faceting (T25): capability + modality slices mirror the by-kind/by-vendor
// shape, so a consumer wanting "every reasoning model" or "every model that handles
// images" fetches one pre-filtered file instead of walking the catalog. A model is in
// `by-modality/<m>` when <m> is one of its input OR output modalities (coarse and
// direction-agnostic — the exact per-direction split lives in stats.json). Derived from
// the same flattened entries; each slice keeps the shared envelope + a narrowing key.
const modalitiesOf = (e) =>
  [...new Set([...((e.modalities && e.modalities.input) || []), ...((e.modalities && e.modalities.output) || [])])];
const presentCaps = [...new Set(flat.flatMap((e) => e.capabilities || []))].sort();
const presentModalities = [...new Set(flat.flatMap(modalitiesOf))].sort();
const byCapability = Object.fromEntries(
  presentCaps.map((c) => [c, slice({ capability: c }, (e) => (e.capabilities || []).includes(c))]),
);
const byModality = Object.fromEntries(
  presentModalities.map((m) => [m, slice({ modality: m }, (e) => modalitiesOf(e).includes(m))]),
);

// Alias resolution map (T25): alias id → its canonical { vendor, id }, so a consumer
// resolving a `-latest`/dated-snapshot alias needn't scan every entry. Empty until
// entries carry `aliases`; populated automatically at emit when they do.
const aliasIndex = {};
for (const e of flat) {
  for (const a of e.aliases || []) {
    const prior = aliasIndex[a];
    if (prior && (prior.vendor !== e.vendor || prior.id !== e.id)) {
      console.warn(`emit-model-catalog: alias "${a}" claimed by ${prior.vendor}/${prior.id} and ${e.vendor}/${e.id}; keeping the first`);
      continue;
    }
    aliasIndex[a] = { vendor: e.vendor, id: e.id };
  }
}
const aliases = {
  version: root.version,
  lastUpdated: root.lastUpdated,
  source: SOURCE_URL,
  count: Object.keys(aliasIndex).length,
  aliases: Object.fromEntries(Object.keys(aliasIndex).sort().map((k) => [k, aliasIndex[k]])),
};

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
  coverage: `${SOURCE_URL}/coverage.json`,
  changes: `${SOURCE_URL}/changes.json`,
  feed: `${SOURCE_URL}/feed.xml`,
  csv: `${SOURCE_URL}/catalog.csv`,
  ndjson: `${SOURCE_URL}/catalog.ndjson`,
  aliases: `${SOURCE_URL}/aliases.json`,
  badge: `${SOURCE_URL}/badge.json`,
  llms: `${SOURCE_URL}/llms.txt`,
  pages: `${SOURCE_URL}/models/`,
  schema: `${SOURCE_URL}/catalog.schema.json`,
  ...(plansPublished ? { plans: `${SOURCE_URL}/plans.json`, plansSchema: `${SOURCE_URL}/plans.schema.json` } : {}),
  ...(providersPublished ? { providers: `${SOURCE_URL}/providers.json`, providersSchema: `${SOURCE_URL}/providers.schema.json` } : {}),
  byKind: Object.fromEntries(presentKinds.map((k) => [k, `${SOURCE_URL}/by-kind/${k}.json`])),
  byVendor: Object.fromEntries(Object.keys(vendors).map((v) => [v, `${SOURCE_URL}/by-vendor/${v}.json`])),
  byCapability: Object.fromEntries(presentCaps.map((c) => [c, `${SOURCE_URL}/by-capability/${c}.json`])),
  byModality: Object.fromEntries(presentModalities.map((m) => [m, `${SOURCE_URL}/by-modality/${m}.json`])),
};

// Aggregate metrics (T24): a tiny pre-computed rollup — counts per vendor / kind /
// capability / modality, plus field-fill coverage and grand totals — so the site
// dashboard, the badge and coverage views read one number instead of re-aggregating
// the full catalog. Derived here at emit, so it can never drift from the artifact.
const tally = (values) => { const m = {}; for (const k of values) { m[k] = (m[k] || 0) + 1; } return m; };
// Sort count maps by descending count then key, so the artifact is deterministic + diff-friendly.
const ranked = (map) => Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
// Which optional fields "coverage" tracks, and what counts as filled for each.
// Shared by stats.json's overall coverage (T24) and coverage.json's per-vendor
// breakdown (T29) so the two artifacts can never disagree on the definition.
const COVERAGE_FIELDS = [
  ["contextWindow", (e) => e.contextWindow != null],
  ["maxOutputTokens", (e) => e.maxOutputTokens != null],
  ["embeddingDimensions", (e) => e.embeddingDimensions != null],
  ["capabilities", (e) => (e.capabilities || []).length > 0],
  ["openWeights", (e) => e.openWeights != null], // open-weight vs proprietary (Block I / T39)
  ["parameters", (e) => e.parameters != null], // disclosed total params (Block I / T39)
  ["modalities", (e) => e.modalities != null],
  ["knowledgeCutoff", (e) => e.knowledgeCutoff != null],
  ["releaseDate", (e) => e.releaseDate != null],
  ["aliases", (e) => (e.aliases || []).length > 0],
  ["status", (e) => e.status != null],
  ["sources", (e) => (e.sources || []).length > 0],
  ["lastVerified", (e) => e.lastVerified != null],
  ["pricing", (e) => e.pricing != null], // indicative US list price (Block F / T32)
  ["benchmarks", (e) => e.benchmarks != null], // cited third-party capability index (Block I / T40)
  ["performance", (e) => e.performance != null], // cited speed metrics (Block I / T43)
];
const round4 = (n, d) => (d ? Math.round((n / d) * 1e4) / 1e4 : 0);
// Per-field { filled, rate } over an arbitrary set of entries.
const coverageOf = (entries) =>
  Object.fromEntries(COVERAGE_FIELDS.map(([k, pred]) => {
    let n = 0;
    for (const e of entries) if (pred(e)) n++;
    return [k, { filled: n, rate: round4(n, entries.length) }];
  }));
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
    fields: coverageOf(flat),
  },
};

// Coverage & gaps transparency (T29): the same per-field fill definition as
// stats.json, but broken down per vendor — "context window known for 82% of
// vendor X". Trust grows when gaps are visible, not hidden: every low cell is an
// explicit, low-friction invitation to contribute (via the T28 propose flow).
// Vendors ranked by descending model count then name, so the file is deterministic.
const coverage = {
  version: root.version,
  lastUpdated: root.lastUpdated,
  source: SOURCE_URL,
  fields: COVERAGE_FIELDS.map(([k]) => k),
  overall: { total: flat.length, fields: coverageOf(flat) },
  byVendor: Object.fromEntries(
    Object.entries(vendors)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([v, es]) => [v, { total: es.length, fields: coverageOf(es) }]),
  ),
};

// Embeddable status badge (T27): a shields.io endpoint-shaped `badge.json`
// (`{ schemaVersion, label, message, color }`) so any README can render a live
// "Model Catalog · N models · M vendors" badge via
// https://img.shields.io/endpoint?url=<source>/badge.json. Reads the same totals
// as stats.json, computed at emit, so the number is never stale.
const badge = {
  schemaVersion: 1,
  label: "Model Catalog",
  message: `${stats.totals.models} models · ${stats.totals.vendors} vendors`,
  color: "ea580c", // Viglet brand orange
  cacheSeconds: 3600,
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
  "embeddingDimensions", "capabilities", "openWeights", "parameters",
  "inputModalities", "outputModalities",
  "knowledgeCutoff", "releaseDate", "status", "deprecated", "aliases",
  "sources", "lastVerified",
  // Indicative US list price (Block F / T32) — a reference only, verify with the
  // vendor; empty for models with no trusted price. Currency is always USD.
  "priceInputPer1M", "priceOutputPer1M", "priceCurrency", "priceSource", "priceLastVerified",
  // Cited third-party capability index (Block I / T40) — a reference to a public
  // leaderboard, verify at the source; empty for models with no cited benchmark.
  "benchmarkIntelligenceIndex", "benchmarkArenaElo",
  // Per-domain cited scores (Block I / T42) — recommended domains, empty when absent.
  "benchmarkReasoning", "benchmarkCoding", "benchmarkMath",
  "benchmarkSource", "benchmarkLastVerified",
  // Cited speed metrics (Block I / T43) — a reference, verify at the source.
  "perfThroughputTps", "perfLatencyTtftSec", "perfSource", "perfLastVerified",
];
// A per-domain cited score value (Block I / T42), or undefined.
const benchScore = (e, domain) => e.benchmarks && e.benchmarks.scores && e.benchmarks.scores[domain] && e.benchmarks.scores[domain].value;
const csvCell = (v) => {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join(";") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; // RFC 4180 quoting
};
const csvRow = (e) => CSV_COLUMNS.map((c) => {
  if (c === "inputModalities") return csvCell((e.modalities && e.modalities.input) || []);
  if (c === "outputModalities") return csvCell((e.modalities && e.modalities.output) || []);
  if (c === "priceInputPer1M") return csvCell(e.pricing && e.pricing.inputPer1M);
  if (c === "priceOutputPer1M") return csvCell(e.pricing && e.pricing.outputPer1M);
  if (c === "priceCurrency") return csvCell(e.pricing && e.pricing.currency);
  if (c === "priceSource") return csvCell(e.pricing && e.pricing.source);
  if (c === "priceLastVerified") return csvCell(e.pricing && e.pricing.lastVerified);
  if (c === "benchmarkIntelligenceIndex") return csvCell(e.benchmarks && e.benchmarks.intelligenceIndex);
  if (c === "benchmarkArenaElo") return csvCell(e.benchmarks && e.benchmarks.arenaElo);
  if (c === "benchmarkReasoning") return csvCell(benchScore(e, "reasoning"));
  if (c === "benchmarkCoding") return csvCell(benchScore(e, "coding"));
  if (c === "benchmarkMath") return csvCell(benchScore(e, "math"));
  if (c === "benchmarkSource") return csvCell(e.benchmarks && e.benchmarks.source);
  if (c === "benchmarkLastVerified") return csvCell(e.benchmarks && e.benchmarks.lastVerified);
  if (c === "perfThroughputTps") return csvCell(e.performance && e.performance.throughputTps);
  if (c === "perfLatencyTtftSec") return csvCell(e.performance && e.performance.latencyTtftSec);
  if (c === "perfSource") return csvCell(e.performance && e.performance.source);
  if (c === "perfLastVerified") return csvCell(e.performance && e.performance.lastVerified);
  return csvCell(e[c]);
}).join(",");
const catalogCsv = [CSV_COLUMNS.join(","), ...flat.map(csvRow)].join("\r\n") + "\r\n";
const catalogNdjson = flat.map((e) => JSON.stringify(e)).join("\n") + "\n";

// ── GEO / citability artifacts (T26) ──────────────────────────────────────
// To be *cited* by search engines and assistants, the catalog must be crawlable
// and quotable — not just a JSON blob. Emit an `llms.txt` index (the emerging
// convention for "what's here, as links") plus a real, indexable URL per vendor
// and per model: a Markdown page (quotable prose + a facts table) and a minimal
// self-contained HTML page (meta description + canonical) for each. Every page's
// facts are derived from the same flattened entries, so they match the artifact.
const htmlEsc = xmlEsc; // the same entity escaping is safe for HTML text + attributes
const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const humanCtx = (n) => {
  if (n == null) return null;
  if (n >= 1e6) return `${n % 1e6 === 0 ? n / 1e6 : (n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${n % 1e3 === 0 ? n / 1e3 : (n / 1e3).toFixed(1)}K`;
  return String(n);
};
// Model ids carry `/` and `:` (bedrock/ollama/hf) — slug them to safe, unique,
// lower-case file names, memoized per id so links and files always agree.
const slugsByVendor = {};
const slugFor = (e) => {
  const used = (slugsByVendor[e.vendor] ||= new Map());
  if (used.has(e.id)) return used.get(e.id);
  const base = e.id.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
  const taken = new Set(used.values());
  let slug = base;
  let i = 2;
  while (taken.has(slug)) slug = `${base}-${i++}`;
  used.set(e.id, slug);
  return slug;
};
const vendorUrl = (v) => `${SOURCE_URL}/models/${v}/`;
const modelHtmlUrl = (e) => `${SOURCE_URL}/models/${e.vendor}/${slugFor(e)}.html`;
const modelMdUrl = (e) => `${SOURCE_URL}/models/${e.vendor}/${slugFor(e)}.md`;
const inMods = (e) => (e.modalities && e.modalities.input) || [];
const outMods = (e) => (e.modalities && e.modalities.output) || [];
// Open-weight vs proprietary, when known (Block I / T39).
const weightsLabel = (e) => {
  if (e.openWeights == null) return null;
  return e.openWeights ? "Open-weight" : "Proprietary (API-only)";
};
// Disclosed total parameter count → human string (Block I / T39), e.g. 671B, 8B, 1.7M.
const humanParams = (n) => {
  if (n == null) return null;
  if (n >= 1e9) return `${n % 1e9 === 0 ? n / 1e9 : (n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${n % 1e6 === 0 ? n / 1e6 : (n / 1e6).toFixed(1)}M`;
  return comma(n);
};
// Indicative US list price, one human line (Block F / T32). Always carries the
// "indicative — verify with vendor" caveat so the reference framing travels.
const money = (v) => "$" + Number(v.toFixed(6)).toString();
const priceLine = (p) => {
  if (!p) return null;
  const bits = [];
  if (p.inputPer1M != null) bits.push(`${money(p.inputPer1M)} in`);
  if (p.outputPer1M != null) bits.push(`${money(p.outputPer1M)} out`);
  if (!bits.length) return null;
  return `${bits.join(" / ")} per 1M tokens (indicative US list — verify with vendor)`;
};
// Cited third-party capability index, one human line (Block I / T40). Carries the
// "cited — verify at the source" framing so it never reads as our own verdict.
const benchmarkLine = (b) => {
  if (!b) return null;
  const bits = [];
  if (b.intelligenceIndex != null) bits.push(`intelligence index ${b.intelligenceIndex}`);
  if (b.arenaElo != null) bits.push(`Arena Elo ${b.arenaElo}`);
  // Per-domain cited scores (T42), e.g. "reasoning 60 · coding 55 · math 70".
  for (const [domain, s] of Object.entries(b.scores || {})) {
    if (s && s.value != null) bits.push(`${domain} ${s.value}`);
  }
  if (!bits.length) return null;
  return `${bits.join(" · ")} (cited from ${b.source || "source"} — verify at the source)`;
};
// Cited speed metrics, one human line (Block I / T43).
const performanceLine = (p) => {
  if (!p) return null;
  const bits = [];
  if (p.throughputTps != null) bits.push(`${p.throughputTps} tokens/s`);
  if (p.latencyTtftSec != null) bits.push(`${p.latencyTtftSec}s to first token`);
  if (!bits.length) return null;
  return `${bits.join(" · ")} (cited from ${p.source || "source"} — verify at the source)`;
};

const proseText = (e) => {
  let s = `${e.label} (${e.id}) is a ${e.kind.toLowerCase()} model from ${e.vendor}`;
  if (e.contextWindow != null) s += ` with a ${humanCtx(e.contextWindow)}-token context window`;
  const extra = [];
  if (e.openWeights === true) extra.push(e.parameters != null ? `open-weight (${humanParams(e.parameters)} parameters)` : "open-weight");
  else if (e.openWeights === false) extra.push("proprietary (API-only)");
  else if (e.parameters != null) extra.push(`${humanParams(e.parameters)} parameters`);
  if (e.embeddingDimensions != null) extra.push(`${comma(e.embeddingDimensions)}-dimensional embeddings`);
  if ((e.capabilities || []).length) extra.push(`capabilities ${e.capabilities.join(", ")}`);
  if (inMods(e).length) extra.push(`input ${inMods(e).join(", ")}`);
  if (outMods(e).length) extra.push(`output ${outMods(e).join(", ")}`);
  if (extra.length) s += `; ${extra.join("; ")}`;
  return s + ".";
};
const factRows = (e) => [
  ["Vendor", e.vendor],
  ["Kind", e.kind],
  ["Context window", e.contextWindow != null ? `${comma(e.contextWindow)} tokens` : null],
  ["Max output tokens", e.maxOutputTokens != null ? `${comma(e.maxOutputTokens)} tokens` : null],
  ["Embedding dimensions", e.embeddingDimensions != null ? comma(e.embeddingDimensions) : null],
  ["Indicative price (US list)", priceLine(e.pricing)],
  ["Cited capability index", benchmarkLine(e.benchmarks)],
  ["Cited speed", performanceLine(e.performance)],
  ["Input modalities", inMods(e).join(", ") || null],
  ["Output modalities", outMods(e).join(", ") || null],
  ["Capabilities", (e.capabilities || []).join(", ") || null],
  ["Weights", weightsLabel(e)],
  ["Parameters", e.parameters != null ? humanParams(e.parameters) : null],
  ["Status", e.status || (e.deprecated ? "DEPRECATED" : null)],
  ["Knowledge cutoff", e.knowledgeCutoff || null],
  ["Release date", e.releaseDate || null],
  ["Aliases", (e.aliases || []).join(", ") || null],
  ["Sources", (e.sources || []).join(", ") || null],
  ["Last verified", e.lastVerified || null],
].filter(([, v]) => v != null && v !== "");

const pageHtml = (title, desc, canonical, inner) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEsc(title)}</title>
<meta name="description" content="${htmlEsc(desc)}">
<link rel="canonical" href="${htmlEsc(canonical)}">
<meta property="og:title" content="${htmlEsc(title)}">
<meta property="og:description" content="${htmlEsc(desc)}">
<style>body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6;max-width:48rem;margin:2rem auto;padding:0 1.2rem;color:#1a1512;background:#fff}code{font-family:ui-monospace,Menlo,Consolas,monospace;background:#f5f2ef;padding:.1em .35em;border-radius:.3em;word-break:break-all}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #ececec;vertical-align:top}th{color:#7a6f66;font-weight:600;white-space:nowrap}a{color:#c2410c}h1{line-height:1.2}.crumbs{color:#7a6f66;font-size:.9rem}@media(prefers-color-scheme:dark){body{background:#100c0a;color:#f3ece7}code{background:#1b1512}th,td{border-color:#2a201a}a{color:#fb923c}}</style>
</head>
<body>
${inner}
</body>
</html>
`;

const modelMd = (e) => {
  const table = ["| Field | Value |", "| --- | --- |", ...factRows(e).map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
  return `# ${e.label}

\`${e.id}\` — **${e.vendor}** · ${e.kind}

> ${proseText(e)}

${table}

*Part of the [Model Catalog](${SOURCE_URL}/) — [${e.vendor} models](${vendorUrl(e.vendor)}) · [Vendor JSON](${SOURCE_URL}/by-vendor/${e.vendor}.json) · [HTML](${modelHtmlUrl(e)})*
`;
};
const modelHtml = (e) => {
  const table = `<table><tbody>${factRows(e).map(([k, v]) => `<tr><th>${htmlEsc(k)}</th><td>${htmlEsc(v)}</td></tr>`).join("")}</tbody></table>`;
  const inner = `<p class="crumbs"><a href="${SOURCE_URL}/">Model Catalog</a> › <a href="${htmlEsc(vendorUrl(e.vendor))}">${htmlEsc(e.vendor)}</a></p>
<h1>${htmlEsc(e.label)}</h1>
<p><code>${htmlEsc(e.id)}</code> — ${htmlEsc(e.vendor)} · ${htmlEsc(e.kind)}</p>
<p>${htmlEsc(proseText(e))}</p>
${table}
<p><a href="${htmlEsc(modelMdUrl(e))}">Markdown</a> · <a href="${SOURCE_URL}/by-vendor/${e.vendor}.json">Vendor JSON</a> · <a href="${SOURCE_URL}/catalog.json">Full catalog</a></p>`;
  return pageHtml(`${e.label} · ${e.vendor} — Model Catalog`, proseText(e), modelHtmlUrl(e), inner);
};

const vendorNames = Object.keys(vendors);
const vendorMd = (v, es) => {
  const rows = es.map((e) => `| [${e.label}](${slugFor(e)}.md) | \`${e.id}\` | ${e.kind} | ${e.contextWindow != null ? comma(e.contextWindow) : "—"} |`);
  return `# ${v} models

> ${es.length} model${es.length === 1 ? "" : "s"} from ${v} in the Model Catalog — a vendor-neutral, kind-aware reference. Free, unauthenticated JSON, with optional indicative US list pricing (verify with the vendor).

| Model | id | Kind | Context |
| --- | --- | --- | --- |
${rows.join("\n")}

*[All vendors](${SOURCE_URL}/models/) · [Catalog home](${SOURCE_URL}/) · [${v} JSON](${SOURCE_URL}/by-vendor/${v}.json)*
`;
};
const vendorHtml = (v, es) => {
  const rows = es.map((e) => `<tr><td><a href="${htmlEsc(slugFor(e))}.html">${htmlEsc(e.label)}</a></td><td><code>${htmlEsc(e.id)}</code></td><td>${htmlEsc(e.kind)}</td><td>${e.contextWindow != null ? comma(e.contextWindow) : "—"}</td></tr>`).join("");
  const inner = `<p class="crumbs"><a href="${SOURCE_URL}/">Model Catalog</a> › ${htmlEsc(v)}</p>
<h1>${htmlEsc(v)} models</h1>
<p>${es.length} model${es.length === 1 ? "" : "s"} from ${htmlEsc(v)}. <a href="${SOURCE_URL}/by-vendor/${v}.json">Vendor JSON</a> · <a href="${SOURCE_URL}/models/">All vendors</a></p>
<table><thead><tr><th>Model</th><th>id</th><th>Kind</th><th>Context</th></tr></thead><tbody>${rows}</tbody></table>`;
  return pageHtml(`${v} models — Model Catalog`, `${es.length} ${v} models in the Model Catalog: ids, kinds, context windows and capabilities. Free, unauthenticated JSON.`, vendorUrl(v), inner);
};
const modelsIndexHtml = () => {
  const rows = vendorNames.map((v) => `<li><a href="${htmlEsc(v)}/">${htmlEsc(v)}</a> — ${vendors[v].length} model${vendors[v].length === 1 ? "" : "s"}</li>`).join("");
  const inner = `<p class="crumbs"><a href="${SOURCE_URL}/">Model Catalog</a> › models</p>
<h1>Model Catalog — models by vendor</h1>
<p>${flat.length} models across ${vendorNames.length} vendors. Each has an indexable page with its facts in prose.</p>
<ul>${rows}</ul>
<p><a href="${SOURCE_URL}/llms.txt">llms.txt</a> · <a href="${SOURCE_URL}/catalog.json">Full catalog JSON</a></p>`;
  return pageHtml("Models by vendor — Model Catalog", `Browse ${flat.length} AI models across ${vendorNames.length} vendors — one indexable page per model with kind, context window, modalities and capabilities.`, `${SOURCE_URL}/models/`, inner);
};

const llmsTxt = `# Model Catalog

> A vendor-neutral, kind-aware catalog of ${flat.length} LLM / embedding / rerank / media models across ${vendorNames.length} vendors. Free, unauthenticated, versioned JSON — which model ids exist per vendor and, for each, its kind, context window, modalities, capabilities and an optional indicative US list price (a reference only — verify with the vendor).

## Catalog data
- [Full catalog (JSON)](${SOURCE_URL}/catalog.json): every vendor, every field
- [Compact index](${SOURCE_URL}/index.json): { vendor, id, label, kind } per entry
- [Aggregate stats](${SOURCE_URL}/stats.json): counts per vendor/kind/capability + field coverage
- [Change feed](${SOURCE_URL}/changes.json): what changed at the last publish${plansPublished ? `
- [Consumer plans](${SOURCE_URL}/plans.json): vendor subscription tiers with an indicative US list price (a reference — verify with the vendor)` : ""}${providersPublished ? `
- [Pricing sources](${SOURCE_URL}/providers.json): official vendor pricing pages to verify the catalog's indicative prices against` : ""}
- [JSON Schema](${SOURCE_URL}/catalog.schema.json): the envelope + entry contract
- [Discovery manifest](${SOURCE_URL}/endpoints.json): every published path as an absolute URL

## Vendors
${vendorNames.map((v) => `- [${v}](${vendorUrl(v)}): ${vendors[v].length} model${vendors[v].length === 1 ? "" : "s"}`).join("\n")}

## Models
${flat.map((e) => `- [${e.label}](${modelMdUrl(e)}): ${e.vendor} · ${e.kind}${e.contextWindow != null ? ` · ${humanCtx(e.contextWindow)} ctx` : ""}`).join("\n")}
`;

// Assemble every GEO file with its repo-relative path, ready to write.
const geoPages = [
  ["llms.txt", llmsTxt],
  ["models/index.html", modelsIndexHtml()],
];
for (const v of vendorNames) {
  const es = vendors[v];
  geoPages.push([`models/${v}/index.md`, vendorMd(v, es)]);
  geoPages.push([`models/${v}/index.html`, vendorHtml(v, es)]);
  for (const e of es) {
    const slug = slugFor(e);
    geoPages.push([`models/${v}/${slug}.md`, modelMd(e)]);
    geoPages.push([`models/${v}/${slug}.html`, modelHtml(e)]);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
// Rewrite the slice dirs from scratch so a removed kind/vendor leaves no stale file.
for (const dir of ["by-kind", "by-vendor", "by-capability", "by-modality"]) {
  rmSync(resolve(OUT_DIR, dir), { recursive: true, force: true });
  mkdirSync(resolve(OUT_DIR, dir), { recursive: true });
}
// Rewrite the GEO page tree from scratch so a removed vendor/model leaves no stale page.
rmSync(resolve(OUT_DIR, "models"), { recursive: true, force: true });
// Self-hosted copy of the JS SDK (T50): the browsable page consumes it as a static
// ESM module (no build, no CDN, still zero-dep), making the site the real-world
// acceptance test for the client. Copied verbatim from clients/js so page + published
// package can never drift. Rewritten each run.
rmSync(resolve(OUT_DIR, "sdk"), { recursive: true, force: true });
mkdirSync(resolve(OUT_DIR, "sdk"), { recursive: true });
writeFileSync(resolve(OUT_DIR, "sdk/model-catalog-client.js"), readFileSync(CLIENT_JS_SRC, "utf8"), "utf8");
const write = (rel, obj) => writeFileSync(resolve(OUT_DIR, rel), JSON.stringify(obj, null, 2) + "\n", "utf8");

const json = JSON.stringify(published, null, 2) + "\n";
writeFileSync(resolve(OUT_DIR, "catalog.json"), json, "utf8"); // rolling latest
writeFileSync(resolve(OUT_DIR, `catalog-v${root.version}.json`), json, "utf8"); // pinned
writeFileSync(resolve(OUT_DIR, "catalog.schema.json"), readFileSync(SCHEMA_SRC, "utf8"), "utf8");
write("index.json", index); // compact
write("stats.json", stats); // aggregate metrics (T24)
write("coverage.json", coverage); // per-vendor field coverage (T29)
write("badge.json", badge); // shields.io endpoint badge (T27)
write("changes.json", changes); // change feed (T22)
writeFileSync(resolve(OUT_DIR, "feed.xml"), feedXml, "utf8"); // Atom feed (T22)
writeFileSync(resolve(OUT_DIR, "catalog.csv"), catalogCsv, "utf8"); // flat export (T23)
writeFileSync(resolve(OUT_DIR, "catalog.ndjson"), catalogNdjson, "utf8"); // streaming export (T23)
write("aliases.json", aliases); // alias → canonical map (T25)
if (plansPublished) {
  write("plans.json", plansPublished); // consumer subscription plans (T33)
  writeFileSync(resolve(OUT_DIR, "plans.schema.json"), readFileSync(PLANS_SCHEMA_SRC, "utf8"), "utf8");
}
if (providersPublished) {
  write("providers.json", providersPublished); // pricing-source registry (T35)
  writeFileSync(resolve(OUT_DIR, "providers.schema.json"), readFileSync(PROVIDERS_SCHEMA_SRC, "utf8"), "utf8");
}
for (const [k, v] of Object.entries(byKind)) write(`by-kind/${k}.json`, v);
for (const [k, v] of Object.entries(byVendor)) write(`by-vendor/${k}.json`, v);
for (const [k, v] of Object.entries(byCapability)) write(`by-capability/${k}.json`, v);
for (const [k, v] of Object.entries(byModality)) write(`by-modality/${k}.json`, v);
// GEO / citability pages (T26) — llms.txt + per-vendor / per-model Markdown + HTML.
for (const [rel, content] of geoPages) {
  const abs = resolve(OUT_DIR, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}
write("endpoints.json", endpoints); // discovery manifest

console.log(
  `emit-model-catalog: wrote catalog.json + catalog-v${root.version}.json + schema + index.json + stats.json + coverage.json + ` +
    `changes.json + feed.xml + catalog.csv + catalog.ndjson + aliases.json + ${presentKinds.length} by-kind + ${Object.keys(byVendor).length} by-vendor + ` +
    `${presentCaps.length} by-capability + ${presentModalities.length} by-modality slices + endpoints.json ` +
    `(${Object.keys(vendors).length} vendors, ${count} models) to ${OUT_DIR}`,
);
console.log(`emit-model-catalog: GEO pages — llms.txt + ${geoPages.length - 2} vendor/model pages under models/`);
console.log("emit-model-catalog: sdk/model-catalog-client.js — self-hosted JS SDK for the page (T50)");
console.log(`emit-model-catalog: badge.json — "${badge.label}: ${badge.message}"`);
if (plansPublished) console.log(`emit-model-catalog: plans.json — ${plansCount} consumer plans across ${Object.keys(plansPublished.plans).length} vendors (indicative US list)`);
if (providersPublished) console.log(`emit-model-catalog: providers.json — ${providersCount} provider pricing sources`);
console.log(
  `emit-model-catalog: change feed (baseline: ${changes.baseline}) — ` +
    `${added.length} added, ${removed.length} removed, ${changed.length} lifecycle`,
);
