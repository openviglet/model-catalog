import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseQaEval, validateQaEval } from "./qa-eval.mjs";
import { buildQueryManifest } from "./query-manifest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");

function loadCatalogFlat() {
  const root = JSON.parse(readFileSync(resolve(REPO_ROOT, "catalog/model-catalog.json"), "utf8"));
  return Object.entries(root.vendors).flatMap(([vendor, es]) => es.map((e) => ({ ...e, vendor })));
}

test("parseQaEval skips blanks/comments and reports bad JSON by line", () => {
  const text = `{"id":"a","question":"q","expect":{"ids":["x/y"]}}\n\n# a comment\n{"id":"b","question":"q2","expect":{"filter":{"kind":"CHAT"}}}\n`;
  const parsed = parseQaEval(text);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].entry.id, "a");
  assert.equal(parsed[1].line, 4);
  assert.throws(() => parseQaEval(`{not json}`), /invalid JSON/);
});

test("validateQaEval flags structural errors on a malformed set", () => {
  const flat = [{ vendor: "openai", id: "gpt", kind: "CHAT", capabilities: ["tools"] }];
  const manifest = buildQueryManifest(flat, {});
  const parsed = parseQaEval(
    `{"id":"ok","question":"q","expect":{"ids":["openai/gpt"],"filter":{"kind":"CHAT"}}}\n` +
    `{"question":"no id","expect":{"ids":["openai/gpt"]}}\n` +
    `{"id":"noexpect","question":"q"}\n` +
    `{"id":"badsort","question":"q","expect":{"filter":{"sort":"nope"}}}\n` +
    `{"id":"badkey","question":"q","expect":{"filter":{"bogus":1}}}\n`,
  );
  const { structural } = validateQaEval(parsed, { flat, manifest });
  assert.ok(structural.some((e) => /missing string `id`/.test(e)));
  assert.ok(structural.some((e) => /missing `expect`/.test(e)));
  assert.ok(structural.some((e) => /filter.sort/.test(e)));
  assert.ok(structural.some((e) => /unknown filter key/.test(e)));
});

test("validateQaEval flags drift when an expected id is gone or mismatched", () => {
  const flat = [{ vendor: "openai", id: "gpt", kind: "CHAT", capabilities: ["tools"], openWeights: false }];
  const manifest = buildQueryManifest(flat, {});
  const parsed = parseQaEval(
    `{"id":"gone","question":"q","expect":{"ids":["openai/removed"]}}\n` +
    `{"id":"wrongkind","question":"q","expect":{"ids":["openai/gpt"],"filter":{"kind":"EMBEDDING"}}}\n` +
    `{"id":"wrongcap","question":"q","expect":{"ids":["openai/gpt"],"filter":{"kind":"CHAT","capabilities":["vision"]}}}\n`,
  );
  const { structural, drift } = validateQaEval(parsed, { flat, manifest });
  assert.deepEqual(structural, []);
  assert.ok(drift.some((e) => /not in the catalog/.test(e)));
  assert.ok(drift.some((e) => /not EMBEDDING|is kind CHAT/.test(e)));
  assert.ok(drift.some((e) => /lacks capability "vision"/.test(e)));
});

// Drift check against the LIVE catalog (T62): the committed eval set must stay
// truthful as the catalog changes — every id resolves, every filter references a
// real query-manifest field, and at least one case seeds an example prompt.
test("committed qa-eval.jsonl resolves against the live catalog", () => {
  const flat = loadCatalogFlat();
  const manifest = buildQueryManifest(flat, {});
  const parsed = parseQaEval(readFileSync(resolve(REPO_ROOT, "catalog/qa-eval.jsonl"), "utf8"));
  assert.ok(parsed.length > 0, "eval set is non-empty");
  const { structural, drift, exampleCount } = validateQaEval(parsed, { flat, manifest });
  assert.deepEqual(structural, [], `structural errors:\n${structural.join("\n")}`);
  assert.deepEqual(drift, [], `catalog drift:\n${drift.join("\n")}`);
  assert.ok(exampleCount > 0, "at least one case is flagged as an example prompt");
});
