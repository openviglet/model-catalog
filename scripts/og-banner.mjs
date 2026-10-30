/*
 * Social banners — renders public/og-banner.png (2400x1260) and
 * public/og-banner-square.png (2400x2400) from the scripts/og-banner.html template.
 *
 * Fills the template from the published data so the banners never drift from it:
 * the stats row from public/stats.json (run `npm run emit` first) and the code card
 * from the newest Anthropic CHAT entry of the canonical catalog. Then screenshots
 * the page at 2x with a locally installed headless Chrome / Edge (override with
 * CHROME_PATH). Zero-dep (Node built-ins only); run by hand when the numbers or the
 * brand change: `npm run banner`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPTS, "..");
const PUBLIC = join(ROOT, "public");

const BANNERS = [
  { file: "og-banner.png", width: 1200, height: 630, query: "" },
  { file: "og-banner-square.png", width: 1200, height: 1200, query: "?square" },
];

const BROWSERS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const key = (k) => `<span class="k">"${esc(k)}"</span>`;
const str = (s) => `<span class="s">"${esc(s)}"</span>`;
const num = (n) => `<span class="n">${n}</span>`;
const list = (a) => `[${a.map(str).join(", ")}]`;

/** Round down to a "1,000+"-style headline figure. */
function headline(n) {
  const step = n >= 1000 ? 100 : n >= 100 ? 10 : 1;
  return (Math.floor(n / step) * step).toLocaleString("en-US");
}

/** The code card: the newest Anthropic CHAT entry, as highlighted JSON lines. */
function exampleLines(catalog) {
  const models = catalog.vendors.anthropic ?? [];
  const m = models
    .filter((e) => e.kind === "CHAT" && e.releaseDate && e.contextWindow)
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))[0];
  if (!m) throw new Error("og-banner: no Anthropic CHAT entry with releaseDate + contextWindow");
  const lines = [
    `${key("vendor")}: ${str("anthropic")},`,
    `${key("id")}: ${str(m.id)},`,
    `${key("kind")}: ${str(m.kind)},`,
    `${key("contextWindow")}: ${num(m.contextWindow)},`,
  ];
  if (m.capabilities?.length) lines.push(`${key("capabilities")}: ${list(m.capabilities)},`);
  if (m.modalities?.input?.length) lines.push(`${key("modalities")}: { ${key("input")}: ${list(m.modalities.input)} },`);
  lines.push(`${key("lastVerified")}: ${str(m.lastVerified ?? catalog.lastUpdated)},`);
  return lines.join("\n");
}

function findBrowser() {
  const found = BROWSERS.find((p) => p && existsSync(p));
  if (!found) throw new Error("og-banner: no Chrome/Edge found — set CHROME_PATH");
  return found;
}

function main() {
  const stats = JSON.parse(readFileSync(join(PUBLIC, "stats.json"), "utf8"));
  const catalog = JSON.parse(readFileSync(join(ROOT, "catalog", "model-catalog.json"), "utf8"));
  const kinds = Object.keys(stats.byKind ?? {}).filter((k) => k !== "UNKNOWN").length;

  // The filled page lives in a temp dir; <base> keeps the template's ../public/* links resolving.
  const html = readFileSync(join(SCRIPTS, "og-banner.html"), "utf8")
    .replace("{{BASE}}", `<base href="${pathToFileURL(SCRIPTS).href}/" />`)
    .replace("{{MODELS}}", headline(stats.totals.models))
    .replace("{{VENDORS}}", String(stats.totals.vendors))
    .replace("{{KINDS}}", String(kinds))
    .replace("{{EXAMPLE}}", exampleLines(catalog));

  const tmp = mkdtempSync(join(tmpdir(), "og-banner-"));
  try {
    const page = join(tmp, "og-banner.html");
    writeFileSync(page, html);
    const browser = findBrowser();
    for (const b of BANNERS) {
      const out = join(PUBLIC, b.file);
      execFileSync(browser, [
        "--headless", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
        `--user-data-dir=${join(tmp, "profile")}`,
        "--force-device-scale-factor=2", `--window-size=${b.width},${b.height}`,
        "--virtual-time-budget=3000", `--screenshot=${out}`,
        pathToFileURL(page).href + b.query,
      ], { stdio: "ignore" });
      if (!existsSync(out)) throw new Error(`og-banner: ${b.file} was not written`);
      console.log(`og-banner: ${b.file} — ${b.width * 2}x${b.height * 2}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
