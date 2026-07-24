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
import { buildContextTxt, buildQueryManifest } from "./query-manifest.mjs";
import { parseQaEval, validateQaEval } from "./qa-eval.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");
const SRC = resolve(REPO_ROOT, "catalog/model-catalog.json");
const SCHEMA_SRC = resolve(REPO_ROOT, "catalog/model-catalog.schema.json");
const PLANS_SRC = resolve(REPO_ROOT, "catalog/plans.json"); // consumer plans dataset (T33)
const PLANS_SCHEMA_SRC = resolve(REPO_ROOT, "catalog/plans.schema.json");
const PROVIDERS_SRC = resolve(REPO_ROOT, "catalog/providers.json"); // pricing-source registry (T35)
const PROVIDERS_SCHEMA_SRC = resolve(REPO_ROOT, "catalog/providers.schema.json");
const CLIENT_JS_SRC = resolve(REPO_ROOT, "clients/js/index.js"); // the JS SDK the page dogfoods (T50)
const QA_EVAL_SRC = resolve(REPO_ROOT, "catalog/qa-eval.jsonl"); // grounded-answer eval set (T62)
const OUT_DIR = resolve(REPO_ROOT, "public");
// Public base URL — the GitHub Pages site for this repo. The endpoint intentionally
// stays on this public host (a community-owned home, not a brand asset); the
// CATALOG_SOURCE_URL env only exists so an alternate deployment can override it.
const SOURCE_URL = process.env.CATALOG_SOURCE_URL || "https://openviglet.github.io/model-catalog";
const SOURCE_URL_REPO = process.env.CATALOG_REPO_URL || "https://github.com/openviglet/model-catalog";

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

// Validate + flatten (add `vendor` + globally-unique `ref` to each entry).
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
    // `ref` = the globally-unique "<vendor>/<id>" key. The bare `id` is NOT unique
    // across vendors (e.g. openai+azure both serve `gpt-4o`; gemini/gemini-openai/
    // vertex-ai all serve `gemini-2.5-pro`; groq+openrouter both `openai/gpt-oss-120b`),
    // so a consumer that keys documents by `id` alone silently collides. Emit-added
    // like `vendor`; consumers should key on `ref` (T79).
    return { ...e, vendor, ref: `${vendor}/${e.id}` };
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

// Grounded-answer eval set (T62): a curated `question → expected id(s) / filter`
// list that seeds the "Ask the catalog" widget's example prompts and doubles as a
// drift check. Optional: absent → not published. Malformed shape is fatal (the
// file is committed source); id/filter DRIFT is a warning only, so a legitimate
// catalog change never blocks a publish over a stale eval anchor — the node:test
// (`npm test`) is the hard drift gate. Validated against the query manifest built
// from the same flat entries below, so its filters can only cite real fields.
let qaEvalText = null;
if (existsSync(QA_EVAL_SRC)) {
  qaEvalText = readFileSync(QA_EVAL_SRC, "utf8");
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
      entries.map((e) => ({ vendor, ref: e.ref, id: e.id, label: e.label, kind: e.kind })),
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
  leaderboards: `${SOURCE_URL}/leaderboards.json`,
  changes: `${SOURCE_URL}/changes.json`,
  feed: `${SOURCE_URL}/feed.xml`,
  csv: `${SOURCE_URL}/catalog.csv`,
  ndjson: `${SOURCE_URL}/catalog.ndjson`,
  queryManifest: `${SOURCE_URL}/query-manifest.json`,
  context: `${SOURCE_URL}/context.txt`,
  ...(qaEvalText ? { qaEval: `${SOURCE_URL}/qa-eval.jsonl` } : {}),
  aliases: `${SOURCE_URL}/aliases.json`,
  badge: `${SOURCE_URL}/badge.json`,
  llms: `${SOURCE_URL}/llms.txt`,
  pages: `${SOURCE_URL}/models/`,
  hubs: `${SOURCE_URL}/hubs/`,
  sitemap: `${SOURCE_URL}/sitemap.xml`,
  robots: `${SOURCE_URL}/robots.txt`,
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

// ── Decision leaderboards (T54) ───────────────────────────────────────────
// Pre-computed "which model" answers a consumer (or a citing assistant) wants in
// one fetch — cheapest per kind, best intelligence-per-dollar, biggest context,
// fastest — instead of downloading the whole catalog and ranking it. Each board
// carries `{ population, total }` so the denominator ships with the data (honest
// about the sparse fields), and every ranked figure stays *cited/indicative* —
// derived at emit from the same flat entries, so it can never drift.
const LEADERBOARD_TOP = 10;
const inputPrice = (e) => (e.pricing ? e.pricing.inputPer1M : null);
const intelIndex = (e) => (e.benchmarks ? e.benchmarks.intelligenceIndex : null);
const throughput = (e) => (e.performance ? e.performance.throughputTps : null);
const roundVal = (n) => Math.round(n * 1e4) / 1e4;
const makeBoard = (id, label, metric, unit, order, scope, valueOf) => {
  const pool = flat.filter(scope);
  const withVal = pool
    .map((e) => [e, valueOf(e)])
    .filter(([, v]) => v != null && Number.isFinite(v));
  withVal.sort((a, b) => (order === "asc" ? a[1] - b[1] : b[1] - a[1]));
  return {
    id, label, metric, unit, order,
    total: pool.length,
    population: withVal.length,
    entries: withVal.slice(0, LEADERBOARD_TOP).map(([e, v]) => ({
      vendor: e.vendor, id: e.id, label: e.label, kind: e.kind, value: roundVal(v),
    })),
  };
};
const leaderboardDefs = [
  // Cheapest per kind — only for kinds that actually have priced models.
  ...presentKinds
    .filter((k) => flat.some((e) => e.kind === k && inputPrice(e) != null))
    .map((k) => makeBoard(`cheapest-${k.toLowerCase()}`, `Lowest price ${k.toLowerCase()}`,
      "pricing.inputPer1M", "$ / 1M in", "asc", (e) => e.kind === k, inputPrice)),
  makeBoard("intelligence-per-dollar", "Best intelligence per $",
    "benchmarks.intelligenceIndex / pricing.inputPer1M", "index pts per $/1M in", "desc",
    () => true, (e) => (intelIndex(e) != null && inputPrice(e) > 0 ? intelIndex(e) / inputPrice(e) : null)),
  makeBoard("biggest-context", "Biggest context window",
    "contextWindow", "tokens", "desc", () => true, (e) => e.contextWindow),
  makeBoard("fastest", "Fastest throughput",
    "performance.throughputTps", "tok / s", "desc", () => true, throughput),
];
const leaderboards = {
  version: root.version,
  lastUpdated: root.lastUpdated,
  source: SOURCE_URL,
  disclaimer: "Derived from the catalog's indicative/cited figures — a reference only, verify at the source. Each board reports its population (models with the metric) over its total.",
  leaderboards: leaderboardDefs.filter((b) => b.population > 0),
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
// serves streaming, `jq -c` and `grep` — and doubles as the search-index feed a
// vectorless/structured-RAG ingester imports (e.g. the Viglet Cloud SN dogfood),
// so it additionally carries conventional display aliases (title/text/abstract/url,
// T81). Both derive from the same flattened entries as catalog.json, in the same
// order, so they can never drift. Array fields are `;`-joined in CSV; modalities are
// split into input/output columns.
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
const csvCellFor = (e, c) => {
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
};
// Data hygiene (T53): don't advertise always-empty columns. Keep the identity/core
// columns unconditionally, but drop any optional column that is empty for EVERY model
// — self-healing (a column reappears the moment a value is recorded), so consumers
// never see a wall of blank fields that erodes trust in the data.
const CSV_ALWAYS = new Set(["vendor", "id", "label", "kind"]);
const activeCsvCols = CSV_COLUMNS.filter((c) => CSV_ALWAYS.has(c) || flat.some((e) => csvCellFor(e, c) !== ""));
const droppedCsvCols = CSV_COLUMNS.filter((c) => !activeCsvCols.includes(c));
const csvRow = (e) => activeCsvCols.map((c) => csvCellFor(e, c)).join(",");
const catalogCsv = [activeCsvCols.join(","), ...flat.map(csvRow)].join("\r\n") + "\r\n";
// `catalogNdjson` is built lower down (search-index display fields, T81) — it needs
// `proseText` / `modelHtmlUrl`, which are defined further below.

// ── GEO / citability artifacts (T26) ──────────────────────────────────────
// To be *cited* by search engines and assistants, the catalog must be crawlable
// and quotable — not just a JSON blob. Emit an `llms.txt` index (the emerging
// convention for "what's here, as links") plus a real, indexable URL per vendor
// and per model: a Markdown page (quotable prose + a facts table) and a minimal
// self-contained HTML page (meta description + canonical) for each. Every page's
// facts are derived from the same flattened entries, so they match the artifact.
const htmlEsc = xmlEsc; // the same entity escaping is safe for HTML text + attributes
const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const plural = (n) => (n === 1 ? "" : "s");
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Price→tier bucketing — the same market proxy for capability (NOT a benchmark)
// the page/SDK classify() derives. Inlined here to keep emit's zero-import stance;
// shared by the per-segment hubs (T34) and the first-class per-model page (T58).
const tierOf = (e) => {
  const inp = e.pricing && e.pricing.inputPer1M;
  if (inp == null) return null;
  return inp >= 5 ? "Frontier" : inp >= 1 ? "High" : inp >= 0.2 ? "Mid" : "Light";
};
const TIER_ORDER = ["Frontier", "High", "Mid", "Light"];
const TIER_HINT = {
  Frontier: "indicative US list ≥ $5 / 1M input tokens",
  High: "$1–5 / 1M input tokens",
  Mid: "$0.20–1 / 1M input tokens",
  Light: "< $0.20 / 1M input tokens",
};
// Rank models for a hub/related list: strongest cited intelligence first, then
// widest context, then label — deterministic + diff-friendly, nulls always last.
const hubRank = (a, b) =>
  (intelIndex(b) ?? -1) - (intelIndex(a) ?? -1) ||
  (b.contextWindow ?? -1) - (a.contextWindow ?? -1) ||
  a.label.localeCompare(b.label);
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

// ── Search-index display fields for the ndjson feed (T81) ──────────────────
// A structured/vectorless-RAG search consumer (the Viglet Cloud SN "model-catalog"
// dogfood) renders each result through conventional *default* fields — title,
// description, text, url — that most search engines' templates expect by those exact
// names. The catalog's native fields are `label`/`id`/`vendor`/`kind` (no `title`,
// `abstract`, `text` or `url`), so an indexer's out-of-the-box defaults find nothing
// and results render blank. To make the feed render correctly with ZERO consumer-side
// config, `catalog.ndjson` (the import feed) additionally carries these standard
// display aliases, all DERIVED from the same entry (never invented): `title` = the
// model label, `abstract`/`text` = the same one-line prose the pages use, `url` = the
// canonical model page. Emitted only on the ndjson feed — `catalog.json` and the
// faceted slices stay the lean, vendor-neutral data API. A consumer that maps its own
// default fields (or ignores these) is unaffected; the aliases are purely additive.
const searchText = (e) => {
  const facts = factRows(e).map(([k, v]) => `${k}: ${v}`).join(". ");
  return facts ? `${proseText(e)} ${facts}.` : proseText(e);
};
const searchDisplayFields = (e) => ({
  title: e.label,
  abstract: proseText(e),
  text: searchText(e),
  url: modelHtmlUrl(e),
});
const catalogNdjson =
  flat.map((e) => JSON.stringify({ ...e, ...searchDisplayFields(e) })).join("\n") + "\n";

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
<style>
:root{--bg:#fbfaf9;--card:#fff;--text:#1a1512;--muted:#7a6f66;--border:#ececec;--border-strong:#e0dcd7;--brand:#ea580c;--brand-3:#c2410c;--brand-ink:#9a3412;--wash:#fff4ec;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:#100c0a;--card:#1b1512;--text:#f3ece7;--muted:#a8988c;--border:#2a201a;--border-strong:#35291f;--brand:#fb923c;--brand-3:#fdba74;--brand-ink:#fdba74;--wash:#26170d;color-scheme:dark}}
*{box-sizing:border-box}
body{font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6;max-width:52rem;margin:0 auto;padding:2.4rem 1.2rem 4rem;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--card);border:1px solid var(--border);padding:.08em .35em;border-radius:.35em;word-break:break-all;font-size:.9em}
a{color:var(--brand-3);text-decoration:none}a:hover{text-decoration:underline}
h1{line-height:1.15;font-size:1.9rem;margin:.2rem 0 .3rem;letter-spacing:-.02em}
h2{font-size:1.05rem;margin:0 0 .8rem;letter-spacing:-.01em}
.crumbs{color:var(--muted);font-size:.86rem}
.mid{color:var(--muted);font-size:.95rem;margin:.15rem 0 .9rem}
.lead{font-size:1.05rem;margin:.2rem 0 0}
.mtags{display:flex;flex-wrap:wrap;gap:.4rem;margin:1rem 0 0}
.badge,.chip,.tier{display:inline-flex;align-items:center;gap:.3rem;border-radius:999px;font-size:.74rem;font-weight:700;padding:.2rem .62rem;white-space:nowrap}
.badge{background:color-mix(in srgb,var(--brand) 15%,transparent);color:var(--brand-3);border:1px solid color-mix(in srgb,var(--brand) 30%,transparent)}
.chip{background:var(--card);border:1px solid var(--border-strong);color:var(--muted);font-weight:600}
.tier{background:var(--wash);color:var(--brand-ink);border:1px solid color-mix(in srgb,var(--brand) 25%,transparent)}
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(7rem,1fr));gap:.7rem;margin:1.6rem 0 0}
.tile{background:var(--card);border:1px solid var(--border);border-radius:.8rem;padding:.8rem .9rem}
.tv{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:1.2rem;line-height:1.1}
.tl{display:block;margin-top:.3rem;color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.sec{margin:1.6rem 0 0;padding:1.15rem 1.3rem;background:var(--card);border:1px solid var(--border);border-radius:1rem}
.dl{display:grid;grid-template-columns:max-content 1fr;gap:.5rem 1.2rem;margin:0}
.dl dt{color:var(--muted);font-size:.82rem;font-weight:600}
.dl dd{margin:0;font-size:.92rem}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.caveat{color:var(--muted);font-size:.8rem;margin:.85rem 0 0;font-style:italic}
.src{display:inline-block;margin:0 .3rem .3rem 0;padding:.12rem .5rem;border-radius:.4rem;font-size:.74rem;font-weight:600;background:var(--card);border:1px solid var(--border-strong)}
.prov{background:var(--wash);border:1px solid color-mix(in srgb,var(--brand) 22%,transparent);border-radius:1rem;padding:1.05rem 1.3rem;margin:1.6rem 0 0}
.prov h2{color:var(--brand-ink)}
.rel{display:grid;grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));gap:.7rem;margin:0}
.rel-card{display:block;background:var(--bg);border:1px solid var(--border);border-radius:.7rem;padding:.7rem .8rem}
.rel-card:hover{border-color:var(--brand);text-decoration:none}
.rel-nm{font-weight:700;font-size:.9rem;color:var(--text)}
.rel-sub{color:var(--muted);font-size:.76rem;margin-top:.15rem}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid var(--border);vertical-align:top}
th{color:var(--muted);font-weight:600;white-space:nowrap}
.pagelinks{margin:1.7rem 0 0;color:var(--muted);font-size:.9rem}
.tm{margin:2.6rem 0 0;padding-top:1.2rem;border-top:1px solid var(--border);color:var(--muted);font-size:.78rem;line-height:1.55}
</style>
</head>
<body>
${inner}
<footer class="tm">Catalog data is provided as is; accuracy is not warranted — figures are indicative and cited, verify against the vendor. All product names, logos and brands are the property of their respective owners. Viglet is an independent project and is not affiliated with, endorsed by, or sponsored by any vendor listed in this catalog; vendor names are used here for identification (nominative-use) only. · By <a href="https://www.viglet.org">Viglet</a> · code <a href="${SOURCE_URL_REPO}/blob/main/LICENSE">Apache-2.0</a> · data <a href="${SOURCE_URL_REPO}/blob/main/LICENSE-DATA">CC-BY 4.0</a>.</footer>
</body>
</html>
`;

// Use-case tags for the page header — the same derivation as the page/SDK
// classify() (inlined; open-weights is surfaced as its own header chip).
const CODING_RE = /cod(e|er|ing)/;
const useCaseTags = (e) => {
  const caps = e.capabilities || [];
  const hay = `${e.id || ""} ${e.label || ""}`.toLowerCase();
  const tags = [];
  switch (e.kind) {
    case "EMBEDDING": tags.push("Embeddings"); break;
    case "RERANK": tags.push("Reranking"); break;
    case "IMAGE": tags.push("Image gen"); break;
    case "SPEECH": tags.push("Speech"); break;
    case "TRANSCRIPTION": tags.push("Transcription"); break;
    case "VIDEO": tags.push("Video"); break;
    case "MODERATION": tags.push("Moderation"); break;
    default: // CHAT / UNKNOWN
      if (caps.includes("reasoning")) tags.push("Reasoning");
      if (CODING_RE.test(hay)) tags.push("Coding");
      if (inMods(e).includes("image") || caps.includes("vision")) tags.push("Multimodal");
      if (!tags.length) tags.push("Chat");
  }
  return tags;
};
// Derived "related models" for a per-model page (T58): same vendor + same kind
// neighbours first, then — if fewer than four — same-kind models in the same
// price tier from other vendors, ranked by the shared hubRank. A loop at emit,
// zero-dep. Capped at six.
const relatedOf = (e) => {
  const pool = flat.filter((x) => x !== e && x.vendor === e.vendor && x.kind === e.kind);
  if (pool.length < 4) {
    const t = tierOf(e);
    for (const x of flat) {
      if (x === e || pool.includes(x)) continue;
      if (x.kind === e.kind && (t == null || tierOf(x) === t)) pool.push(x);
    }
  }
  return pool.sort(hubRank).slice(0, 6);
};
// At-a-glance stat tiles — only the ones this model actually carries (T58).
const statTiles = (e) => {
  const t = [];
  if (e.contextWindow != null) t.push([humanCtx(e.contextWindow), "Context"]);
  if (e.maxOutputTokens != null) t.push([humanCtx(e.maxOutputTokens), "Max output"]);
  if (e.embeddingDimensions != null) t.push([comma(e.embeddingDimensions), "Embed dims"]);
  if (e.pricing && e.pricing.inputPer1M != null) t.push([money(e.pricing.inputPer1M), "$ / 1M in"]);
  if (intelIndex(e) != null) t.push([String(intelIndex(e)), "Intelligence"]);
  if (throughput(e) != null) t.push([String(throughput(e)), "tok / s"]);
  return t;
};

const modelMd = (e) => {
  const table = ["| Field | Value |", "| --- | --- |", ...factRows(e).map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
  return `# ${e.label}

\`${e.id}\` — **${e.vendor}** · ${e.kind}

> ${proseText(e)}

${table}

*Part of the [Model Catalog](${SOURCE_URL}/) — [${e.vendor} models](${vendorUrl(e.vendor)}) · [Vendor JSON](${SOURCE_URL}/by-vendor/${e.vendor}.json) · [HTML](${modelHtmlUrl(e)})*
`;
};
// First-class per-model page (T58): a scannable, citable reference styled to the
// SPA's design tokens — header (vendor / kind / use-case tags / tier / weights),
// an at-a-glance stat strip, populated-only cited sections (each with its caveat +
// source + lastVerified), an always-visible provenance block and derived related
// models. Sparse-aware by *omitting* empty sections (a low-data model reads as
// intentional, not broken) — unlike the drawer/compare, which show "—" for
// alignment. Derived at emit from the same flat entry, so it can't drift.
const dl = (rows) => {
  const kept = rows.filter(([, v]) => v != null && v !== "");
  return kept.length ? `<dl class="dl">${kept.map(([k, v]) => `<dt>${htmlEsc(k)}</dt><dd>${v}</dd>`).join("")}</dl>` : "";
};
const citedFoot = (label, src, lastVerified) =>
  `<p class="caveat">${label}${src ? ` Source: ${htmlEsc(src)}.` : ""}${lastVerified ? ` Last verified ${htmlEsc(lastVerified)}.` : ""}</p>`;
const section = (title, body) => (body ? `<section class="sec"><h2>${htmlEsc(title)}</h2>${body}</section>` : "");
const chipRow = (xs) => xs.map((x) => `<span class="chip">${htmlEsc(x)}</span>`).join(" ");

const modelHtml = (e) => {
  const p = e.pricing;
  const b = e.benchmarks;
  const perf = e.performance;
  const wl = weightsLabel(e);

  const header = `<div class="mtags">
    <span class="badge">${htmlEsc(e.kind)}</span>
    ${tierOf(e) ? `<span class="tier">${htmlEsc(tierOf(e))} tier</span>` : ""}
    ${useCaseTags(e).map((t) => `<span class="chip">${htmlEsc(t)}</span>`).join("")}
    ${wl ? `<span class="chip">${htmlEsc(wl)}</span>` : ""}
  </div>`;

  const tiles = statTiles(e);
  const strip = tiles.length
    ? `<div class="strip">${tiles.map(([v, l]) => `<div class="tile"><span class="tv">${htmlEsc(v)}</span><span class="tl">${htmlEsc(l)}</span></div>`).join("")}</div>`
    : "";

  const pricing = section("Pricing", p ? dl([
    ["Input", p.inputPer1M != null ? `<span class="mono">${htmlEsc(money(p.inputPer1M))}</span> / 1M tokens` : null],
    ["Output", p.outputPer1M != null ? `<span class="mono">${htmlEsc(money(p.outputPer1M))}</span> / 1M tokens` : null],
    ["Currency", p.currency || null],
    ["Note", p.note ? htmlEsc(p.note) : null],
  ]) + citedFoot("Indicative US list price — a reference only, verify with the vendor.", p.source, p.lastVerified) : "");

  const benchmarks = section("Benchmarks", b ? dl([
    ["Intelligence index", b.intelligenceIndex != null ? `<span class="mono">${b.intelligenceIndex}</span>` : null],
    ["Arena Elo", b.arenaElo != null ? `<span class="mono">${b.arenaElo}</span>` : null],
    ...Object.entries(b.scores || {}).map(([domain, s]) => [cap1(domain), s && s.value != null ? `<span class="mono">${s.value}</span>` : null]),
  ]) + citedFoot("Cited from a public third-party leaderboard — a reference, verify at the source.", b.source, b.lastVerified) : "");

  const performance = section("Performance", perf ? dl([
    ["Throughput", perf.throughputTps != null ? `<span class="mono">${perf.throughputTps}</span> tokens/s` : null],
    ["Latency (TTFT)", perf.latencyTtftSec != null ? `<span class="mono">${perf.latencyTtftSec}</span> s` : null],
  ]) + citedFoot("Cited speed metrics — a reference, verify at the source.", perf.source, perf.lastVerified) : "");

  const specs = section("Specifications", dl([
    ["Context window", e.contextWindow != null ? `<span class="mono">${comma(e.contextWindow)}</span> tokens <span class="crumbs">(${humanCtx(e.contextWindow)})</span>` : null],
    ["Max output", e.maxOutputTokens != null ? `<span class="mono">${comma(e.maxOutputTokens)}</span> tokens` : null],
    ["Embedding dimensions", e.embeddingDimensions != null ? `<span class="mono">${comma(e.embeddingDimensions)}</span>` : null],
    ["Weights", wl],
    ["Parameters", e.parameters != null ? `<span class="mono">${htmlEsc(humanParams(e.parameters))}</span>` : null],
    ["Input modalities", inMods(e).length ? chipRow(inMods(e)) : null],
    ["Output modalities", outMods(e).length ? chipRow(outMods(e)) : null],
    ["Knowledge cutoff", e.knowledgeCutoff || null],
    ["Release date", e.releaseDate || null],
    ["Status", e.status || (e.deprecated ? "DEPRECATED" : null)],
    ["Aliases", (e.aliases || []).length ? chipRow(e.aliases) : null],
  ]));

  const capabilities = section("Capabilities", (e.capabilities || []).length ? chipRow(e.capabilities) : "");

  const srcs = (e.sources || []).map((s) => `<span class="src">${htmlEsc(s)}</span>`).join("");
  const prov = `<section class="prov"><h2>Provenance</h2>
    <div style="margin-bottom:.4rem">${srcs || '<span class="crumbs">No sources recorded</span>'}</div>
    <div class="crumbs">Last verified: ${htmlEsc(e.lastVerified || "unknown")}</div></section>`;

  const rel = relatedOf(e);
  const related = rel.length ? `<section class="sec"><h2>Related models</h2><div class="rel">${rel.map((r) =>
    `<a class="rel-card" href="${htmlEsc(modelHtmlUrl(r))}"><span class="rel-nm">${htmlEsc(r.label)}</span><div class="rel-sub"><code>${htmlEsc(r.id)}</code></div><div class="rel-sub">${htmlEsc(r.vendor)} · ${htmlEsc(r.kind)}${r.contextWindow != null ? ` · ${humanCtx(r.contextWindow)} ctx` : ""}</div></a>`).join("")}</div></section>` : "";

  const inner = `<p class="crumbs"><a href="${SOURCE_URL}/">Model Catalog</a> › <a href="${htmlEsc(vendorUrl(e.vendor))}">${htmlEsc(e.vendor)}</a></p>
<h1>${htmlEsc(e.label)}</h1>
<p class="mid"><code>${htmlEsc(e.id)}</code></p>
${header}
<p class="lead">${htmlEsc(proseText(e))}</p>
${strip}
${pricing}
${benchmarks}
${performance}
${specs}
${capabilities}
${prov}
${related}
<p class="pagelinks"><a href="${htmlEsc(modelMdUrl(e))}">Markdown</a> · <a href="${SOURCE_URL}/by-vendor/${e.vendor}.json">Vendor JSON</a> · <a href="${SOURCE_URL}/catalog.json">Full catalog</a> · <a href="${htmlEsc(vendorUrl(e.vendor))}">All ${htmlEsc(e.vendor)} models</a></p>`;
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

// ── Per-segment hubs (T34) ────────────────────────────────────────────────
// A crawlable, human-scannable landing page per segment — per kind, per
// capability, per input/output modality and per price tier — each a compact
// *leaderboard* (the segment's models pre-ranked, cross-linked to their
// per-model pages) + a short prose intro + links out to the matching JSON slice
// and to Explore pre-filtered to that segment. Deliberately not a bare link
// list: the durable "reference/cite" counterpart to the interactive Explore SPA.
// Derived at emit from the same flat entries, so a hub can never disagree with
// the catalog it summarises.
const HUB_TOP = 12;
// Segment keys can carry chars unsafe in a file name (capabilities/modalities);
// slug them the same way model ids are slugged, so links and files always agree.
const hubSlug = (key) => String(key).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "x";
const hubHtmlUrl = (group, key) => `${SOURCE_URL}/hubs/${group}/${hubSlug(key)}.html`;
const hubMdUrl = (group, key) => `${SOURCE_URL}/hubs/${group}/${hubSlug(key)}.md`;
const exploreUrl = (frag) => `${SOURCE_URL}/#${frag}`;

// Every hub descriptor: { group, key, title, blurb, members (ranked), sliceUrl?, explore }.
const hubDefs = [];
for (const k of presentKinds) {
  const members = flat.filter((e) => e.kind === k).sort(hubRank);
  hubDefs.push({
    group: "kind", key: k, title: `${k} models`,
    blurb: `${members.length} ${k.toLowerCase()} model${plural(members.length)} in the Model Catalog, ranked by cited intelligence then context window.`,
    members, sliceUrl: `${SOURCE_URL}/by-kind/${k}.json`, explore: exploreUrl(`kind=${k}`),
  });
}
for (const c of presentCaps) {
  const members = flat.filter((e) => (e.capabilities || []).includes(c)).sort(hubRank);
  hubDefs.push({
    group: "capability", key: c, title: `${cap1(c)} models`,
    blurb: `${members.length} model${plural(members.length)} with the ${c} capability, across ${new Set(members.map((e) => e.vendor)).size} vendor${plural(new Set(members.map((e) => e.vendor)).size)}.`,
    members, sliceUrl: `${SOURCE_URL}/by-capability/${c}.json`, explore: exploreUrl(`cap=${encodeURIComponent(c)}`),
  });
}
for (const mo of presentModalities) {
  const members = flat.filter((e) => modalitiesOf(e).includes(mo)).sort(hubRank);
  hubDefs.push({
    group: "modality", key: mo, title: `${cap1(mo)} models`,
    blurb: `${members.length} model${plural(members.length)} that handle ${mo} as an input or output modality.`,
    members, sliceUrl: `${SOURCE_URL}/by-modality/${mo}.json`, explore: exploreUrl(`in=${encodeURIComponent(mo)}`),
  });
}
for (const t of TIER_ORDER) {
  const members = flat.filter((e) => tierOf(e) === t).sort(hubRank);
  if (!members.length) continue;
  hubDefs.push({
    group: "tier", key: t, title: `${t}-tier models`,
    blurb: `${members.length} ${t.toLowerCase()}-tier model${plural(members.length)} (${TIER_HINT[t]}) — a market proxy for capability, not a benchmark. Verify prices with the vendor.`,
    members, sliceUrl: null, explore: exploreUrl(`tier=${t}`),
  });
}

const hubCaveat = "Prices are indicative US list (verify with the vendor); intelligence is a cited third-party index (verify at the source).";
const hubMd = (h) => {
  const rows = h.members.slice(0, HUB_TOP).map((e, i) =>
    `| ${i + 1} | [${e.label}](${modelMdUrl(e)}) | \`${e.id}\` | ${e.kind} | ${e.contextWindow != null ? humanCtx(e.contextWindow) : "—"} | ${e.pricing && e.pricing.inputPer1M != null ? money(e.pricing.inputPer1M) : "—"} | ${intelIndex(e) != null ? intelIndex(e) : "—"} |`).join("\n");
  const links = [
    `[Explore pre-filtered ↗](${h.explore})`,
    ...(h.sliceUrl ? [`[JSON slice](${h.sliceUrl})`] : []),
    `[All segments](${SOURCE_URL}/hubs/)`,
    `[Catalog home](${SOURCE_URL}/)`,
  ].join(" · ");
  const more = h.members.length > HUB_TOP ? `Showing the top ${HUB_TOP} of ${h.members.length}. ` : "";
  return `# ${h.title}

> ${h.blurb}

| # | Model | id | Kind | Context | $ / 1M in | Intelligence |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

*${more}${hubCaveat}*

${links}
`;
};
const hubHtml = (h) => {
  const rows = h.members.slice(0, HUB_TOP).map((e, i) =>
    `<tr><td>${i + 1}</td><td><a href="${htmlEsc(modelHtmlUrl(e))}">${htmlEsc(e.label)}</a></td><td><code>${htmlEsc(e.id)}</code></td><td>${htmlEsc(e.kind)}</td><td>${e.contextWindow != null ? comma(e.contextWindow) : "—"}</td><td>${e.pricing && e.pricing.inputPer1M != null ? htmlEsc(money(e.pricing.inputPer1M)) : "—"}</td><td>${intelIndex(e) != null ? intelIndex(e) : "—"}</td></tr>`).join("");
  const links = [
    `<a href="${htmlEsc(h.explore)}">Explore pre-filtered ↗</a>`,
    ...(h.sliceUrl ? [`<a href="${htmlEsc(h.sliceUrl)}">JSON slice</a>`] : []),
    `<a href="${SOURCE_URL}/hubs/">All segments</a>`,
    `<a href="${SOURCE_URL}/catalog.json">Full catalog</a>`,
  ].join(" · ");
  const more = h.members.length > HUB_TOP ? `<p class="crumbs">Showing the top ${HUB_TOP} of ${h.members.length}.</p>` : "";
  const inner = `<p class="crumbs"><a href="${SOURCE_URL}/">Model Catalog</a> › <a href="${SOURCE_URL}/hubs/">Segments</a> › ${htmlEsc(h.title)}</p>
<h1>${htmlEsc(h.title)}</h1>
<p>${htmlEsc(h.blurb)}</p>
<table><thead><tr><th>#</th><th>Model</th><th>id</th><th>Kind</th><th>Context</th><th>$ / 1M in</th><th>Intelligence</th></tr></thead><tbody>${rows}</tbody></table>
${more}
<p class="crumbs">${htmlEsc(hubCaveat)}</p>
<p>${links}</p>`;
  return pageHtml(`${h.title} — Model Catalog`, h.blurb, hubHtmlUrl(h.group, h.key), inner);
};
const HUB_GROUPS = [["kind", "By kind"], ["capability", "By capability"], ["modality", "By modality"], ["tier", "By price tier"]];
const hubsIndexMd = () => {
  const sections = HUB_GROUPS.map(([g, gl]) => {
    const items = hubDefs.filter((h) => h.group === g)
      .map((h) => `- [${h.title}](${hubMdUrl(h.group, h.key)}): ${h.members.length} model${plural(h.members.length)}`).join("\n");
    return items ? `## ${gl}\n${items}` : "";
  }).filter(Boolean).join("\n\n");
  return `# Model Catalog — segments

> Leaderboard hubs per kind, capability, modality and price tier — each a ranked, cross-linked view into the ${flat.length}-model catalog.

${sections}

*[Models by vendor](${SOURCE_URL}/models/) · [Catalog home](${SOURCE_URL}/) · [Full catalog JSON](${SOURCE_URL}/catalog.json)*
`;
};
const hubsIndexHtml = () => {
  const sections = HUB_GROUPS.map(([g, gl]) => {
    const items = hubDefs.filter((h) => h.group === g)
      .map((h) => `<li><a href="${htmlEsc(hubHtmlUrl(h.group, h.key))}">${htmlEsc(h.title)}</a> <span class="crumbs">${h.members.length}</span></li>`).join("");
    return items ? `<h2>${htmlEsc(gl)}</h2><ul>${items}</ul>` : "";
  }).join("");
  const inner = `<p class="crumbs"><a href="${SOURCE_URL}/">Model Catalog</a> › Segments</p>
<h1>Model Catalog — segments</h1>
<p>Leaderboard pages per kind, capability, modality and price tier — each a ranked, cross-linked view into the ${flat.length}-model catalog.</p>
${sections}
<p><a href="${SOURCE_URL}/models/">Models by vendor</a> · <a href="${SOURCE_URL}/llms.txt">llms.txt</a> · <a href="${SOURCE_URL}/catalog.json">Full catalog JSON</a></p>`;
  return pageHtml("Segments — Model Catalog", `Browse the Model Catalog by kind, capability, modality and price tier — a ranked leaderboard hub per segment.`, `${SOURCE_URL}/hubs/`, inner);
};

const llmsTxt = `# Model Catalog

> A vendor-neutral, kind-aware catalog of ${flat.length} LLM / embedding / rerank / media models across ${vendorNames.length} vendors. Free, unauthenticated, versioned JSON — which model ids exist per vendor and, for each, its kind, context window, modalities, capabilities and an optional indicative US list price (a reference only — verify with the vendor).

## Catalog data
- [Full catalog (JSON)](${SOURCE_URL}/catalog.json): every vendor, every field
- [Compact index](${SOURCE_URL}/index.json): { vendor, id, label, kind } per entry
- [Aggregate stats](${SOURCE_URL}/stats.json): counts per vendor/kind/capability + field coverage
- [Decision leaderboards](${SOURCE_URL}/leaderboards.json): cheapest per kind, best intelligence-per-$, biggest context, fastest (each with its population/total)
- [Change feed](${SOURCE_URL}/changes.json): what changed at the last publish${plansPublished ? `
- [Consumer plans](${SOURCE_URL}/plans.json): vendor subscription tiers with an indicative US list price (a reference — verify with the vendor)` : ""}${providersPublished ? `
- [Pricing sources](${SOURCE_URL}/providers.json): official vendor pricing pages to verify the catalog's indicative prices against` : ""}
- [JSON Schema](${SOURCE_URL}/catalog.schema.json): the envelope + entry contract
- [Discovery manifest](${SOURCE_URL}/endpoints.json): every published path as an absolute URL

## Segments
- [All segments](${SOURCE_URL}/hubs/): ranked leaderboard hubs by kind, capability, modality and price tier
${hubDefs.map((h) => `- [${h.title}](${hubMdUrl(h.group, h.key)}): ${h.members.length} model${plural(h.members.length)}`).join("\n")}

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
// Per-segment hubs (T34) — one leaderboard page per kind / capability / modality
// / tier + a segment index, each as Markdown (quotable) + HTML (crawlable).
geoPages.push(["hubs/index.md", hubsIndexMd()]);
geoPages.push(["hubs/index.html", hubsIndexHtml()]);
for (const h of hubDefs) {
  geoPages.push([`hubs/${h.group}/${hubSlug(h.key)}.md`, hubMd(h)]);
  geoPages.push([`hubs/${h.group}/${hubSlug(h.key)}.html`, hubHtml(h)]);
}

// sitemap.xml + robots.txt (T34): make every hub + per-model/vendor page
// discoverable to crawlers. Regenerated each run (never stale). lastmod derives
// from `lastUpdated` (no wall-clock read) so the file stays deterministic.
const sitemapUrls = [
  `${SOURCE_URL}/`,
  `${SOURCE_URL}/models/`,
  `${SOURCE_URL}/hubs/`,
  ...hubDefs.map((h) => hubHtmlUrl(h.group, h.key)),
  ...vendorNames.map((v) => vendorUrl(v)),
  ...flat.map((e) => modelHtmlUrl(e)),
];
const sitemapXml = `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${xmlEsc(u)}</loc><lastmod>${root.lastUpdated}</lastmod></url>`).join("\n")}
</urlset>
`;
const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${SOURCE_URL}/sitemap.xml
`;

mkdirSync(OUT_DIR, { recursive: true });
// Rewrite the slice dirs from scratch so a removed kind/vendor leaves no stale file.
for (const dir of ["by-kind", "by-vendor", "by-capability", "by-modality"]) {
  rmSync(resolve(OUT_DIR, dir), { recursive: true, force: true });
  mkdirSync(resolve(OUT_DIR, dir), { recursive: true });
}
// Rewrite the GEO page tree from scratch so a removed vendor/model leaves no stale page.
rmSync(resolve(OUT_DIR, "models"), { recursive: true, force: true });
// Same for the per-segment hub tree (T34) — a removed kind/capability/modality/tier
// leaves no stale hub behind.
rmSync(resolve(OUT_DIR, "hubs"), { recursive: true, force: true });
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
write("leaderboards.json", leaderboards); // decision leaderboards (T54)
write("badge.json", badge); // shields.io endpoint badge (T27)
write("changes.json", changes); // change feed (T22)
writeFileSync(resolve(OUT_DIR, "feed.xml"), feedXml, "utf8"); // Atom feed (T22)
writeFileSync(resolve(OUT_DIR, "catalog.csv"), catalogCsv, "utf8"); // flat export (T23)
writeFileSync(resolve(OUT_DIR, "catalog.ndjson"), catalogNdjson, "utf8"); // streaming export (T23)
// Structured-RAG artifacts (Block M): the field manifest a vectorless/structured
// RAG declares its schema from (T59), and the token-budgeted stuff-all digest (T60).
const queryManifest = buildQueryManifest(flat, {
  source: SOURCE_URL,
  schemaVersion: "1",
  generatedAt: root.lastUpdated,
});
write("query-manifest.json", queryManifest);
writeFileSync(resolve(OUT_DIR, "context.txt"),
  buildContextTxt(flat, { source: SOURCE_URL, lastUpdated: root.lastUpdated }), "utf8");
// Grounded-answer eval set (T62): validate against the manifest just built (so its
// filters can only reference declared fields), then publish verbatim. Structural
// errors are fatal; drift is a non-fatal warning here (see the note above).
let qaEvalCount = 0;
let qaEvalExamples = 0;
if (qaEvalText) {
  const parsed = parseQaEval(qaEvalText);
  const { structural, drift, exampleCount } = validateQaEval(parsed, { flat, manifest: queryManifest });
  if (structural.length) fail(`qa-eval.jsonl is malformed:\n  ${structural.join("\n  ")}`);
  for (const w of drift) console.warn(`emit-model-catalog: qa-eval drift — ${w}`);
  qaEvalCount = parsed.length;
  qaEvalExamples = exampleCount;
  writeFileSync(resolve(OUT_DIR, "qa-eval.jsonl"), qaEvalText, "utf8");
}
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
writeFileSync(resolve(OUT_DIR, "sitemap.xml"), sitemapXml, "utf8"); // crawlable index (T34)
writeFileSync(resolve(OUT_DIR, "robots.txt"), robotsTxt, "utf8"); // (T34)
write("endpoints.json", endpoints); // discovery manifest

console.log(
  `emit-model-catalog: wrote catalog.json + catalog-v${root.version}.json + schema + index.json + stats.json + coverage.json + ` +
    `changes.json + feed.xml + catalog.csv + catalog.ndjson + query-manifest.json + context.txt + aliases.json + ${presentKinds.length} by-kind + ${Object.keys(byVendor).length} by-vendor + ` +
    `${presentCaps.length} by-capability + ${presentModalities.length} by-modality slices + endpoints.json ` +
    `(${Object.keys(vendors).length} vendors, ${count} models) to ${OUT_DIR}`,
);
console.log(`emit-model-catalog: GEO pages — llms.txt + vendor/model pages under models/ + ${hubDefs.length} segment hubs under hubs/ (T34)`);
console.log(`emit-model-catalog: sitemap.xml — ${sitemapUrls.length} URLs + robots.txt (T34)`);
console.log("emit-model-catalog: sdk/model-catalog-client.js — self-hosted JS SDK for the page (T50)");
if (droppedCsvCols.length) console.log(`emit-model-catalog: catalog.csv dropped ${droppedCsvCols.length} always-empty column(s): ${droppedCsvCols.join(", ")} (T53)`);
console.log(`emit-model-catalog: leaderboards.json — ${leaderboards.leaderboards.length} boards (${leaderboards.leaderboards.map((b) => `${b.id}:${b.population}/${b.total}`).join(", ")}) (T54)`);
console.log(`emit-model-catalog: badge.json — "${badge.label}: ${badge.message}"`);
if (qaEvalText) console.log(`emit-model-catalog: qa-eval.jsonl — ${qaEvalCount} grounded-answer cases (${qaEvalExamples} example prompts) (T62)`);
if (plansPublished) console.log(`emit-model-catalog: plans.json — ${plansCount} consumer plans across ${Object.keys(plansPublished.plans).length} vendors (indicative US list)`);
if (providersPublished) console.log(`emit-model-catalog: providers.json — ${providersCount} provider pricing sources`);
console.log(
  `emit-model-catalog: change feed (baseline: ${changes.baseline}) — ` +
    `${added.length} added, ${removed.length} removed, ${changed.length} lifecycle`,
);
