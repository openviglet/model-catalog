/*
 * Staleness check for the hand-curated datasets — catalog/plans.json and
 * catalog/providers.json have no upstream API, so `npm run regen` never refreshes
 * them. Lists every plan whose `lastVerified` is older than the threshold (default
 * 60 days, override with the first argument) so a human re-checks it against the
 * vendor's pricing page. Warns only (exit 0): a stale price is flagged, never guessed.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_DAYS = Number(process.argv[2] ?? 60);
const DAY = 86_400_000;

const age = (date) => Math.floor((Date.now() - Date.parse(date)) / DAY);
const read = (f) => JSON.parse(readFileSync(join(ROOT, "catalog", f), "utf8"));

const stale = [];
for (const [vendor, plans] of Object.entries(read("plans.json").plans)) {
  for (const p of plans) {
    if (age(p.lastVerified) > MAX_DAYS) stale.push(`  ${vendor}/${p.id} — verified ${p.lastVerified} (${p.source})`);
  }
}
const unpriced = Object.values(read("plans.json").plans).flat().filter((p) => p.tier !== "free" && p.priceMonthlyUSD == null);
const providers = read("providers.json");

console.log(`curated: plans.json — ${stale.length} plan(s) older than ${MAX_DAYS} days, ${unpriced.length} paid plan(s) without a price`);
for (const line of stale) console.log(line);
for (const p of unpriced) console.log(`  unpriced: ${p.id} — ${p.source}`);
if (age(providers.lastUpdated) > MAX_DAYS) {
  console.log(`curated: providers.json — last updated ${providers.lastUpdated}; re-check the pricing-page URLs`);
}
