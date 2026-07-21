/**
 * Emits the PUBLIC model catalog artifacts from this repo's single source of
 * truth — `catalog/models-catalog.json` (the enriched envelope). Validates the
 * source structurally (zero-dep, no ajv), flattens each vendor's entries adding a
 * `vendor` field, and writes the published JSON + a pinned version copy + the
 * JSON Schema into `public/` for GitHub Pages to serve at the site root
 * (`<pages>/catalog.json`, `catalog-v1.json`, `catalog.schema.json`, plus the
 * compact `index.json`; see .github/workflows/publish.yml). The browsable
 * `public/index.html` sits at `<pages>/`.
 *
 *   node scripts/emit.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");
const SRC = resolve(REPO_ROOT, "catalog/models-catalog.json");
const SCHEMA_SRC = resolve(REPO_ROOT, "catalog/models-catalog.schema.json");
const OUT_DIR = resolve(REPO_ROOT, "public");
// Public base URL — the GitHub Pages site for this repo. Override-friendly for a
// future custom domain (e.g. models.viglet.org) via the CATALOG_SOURCE_URL env.
const SOURCE_URL = process.env.CATALOG_SOURCE_URL || "https://openviglet.github.io/models-catalog";

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

mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(published, null, 2) + "\n";
writeFileSync(resolve(OUT_DIR, "catalog.json"), json, "utf8"); // rolling latest
writeFileSync(resolve(OUT_DIR, `catalog-v${root.version}.json`), json, "utf8"); // pinned
writeFileSync(resolve(OUT_DIR, "catalog.schema.json"), readFileSync(SCHEMA_SRC, "utf8"), "utf8");
writeFileSync(resolve(OUT_DIR, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf8"); // compact

console.log(
  `emit-model-catalog: wrote catalog.json + catalog-v${root.version}.json + schema + index.json ` +
    `(${Object.keys(vendors).length} vendors, ${count} models) to ${OUT_DIR}`,
);
