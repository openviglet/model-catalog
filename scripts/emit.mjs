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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  schema: `${SOURCE_URL}/catalog.schema.json`,
  byKind: Object.fromEntries(presentKinds.map((k) => [k, `${SOURCE_URL}/by-kind/${k}.json`])),
  byVendor: Object.fromEntries(Object.keys(vendors).map((v) => [v, `${SOURCE_URL}/by-vendor/${v}.json`])),
};

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
for (const [k, v] of Object.entries(byKind)) write(`by-kind/${k}.json`, v);
for (const [k, v] of Object.entries(byVendor)) write(`by-vendor/${k}.json`, v);
write("endpoints.json", endpoints); // discovery manifest

console.log(
  `emit-model-catalog: wrote catalog.json + catalog-v${root.version}.json + schema + index.json + ` +
    `${presentKinds.length} by-kind + ${Object.keys(byVendor).length} by-vendor slices + endpoints.json ` +
    `(${Object.keys(vendors).length} vendors, ${count} models) to ${OUT_DIR}`,
);
