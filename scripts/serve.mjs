/**
 * Serves `public/` over HTTP for local testing of the browsable page (ES modules
 * do not load from file://). Zero-dep: node:http + node:fs only. Run
 * `npm run build` first so `public/app/*` and the JSON artifacts exist.
 *
 *   node scripts/serve.mjs [port] [--open]     (default 8765; --open launches the browser once listening)
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../public");
const args = process.argv.slice(2);
const PORT = Number(args.find((a) => /^\d+$/.test(a))) || 8765;
const OPEN = args.includes("--open");
// Explicit IPv4 loopback: a bare "localhost" can resolve to ::1, where another
// process (e.g. wslrelay) may already hold the port and answer instead of us.
const HOST = "127.0.0.1";
const URL_ = `http://${HOST}:${PORT}/`;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".xml": "application/xml", ".webmanifest": "application/manifest+json",
};

function fileFor(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath.split("?")[0]));
  const path = join(ROOT, rel);
  if (path !== ROOT && !path.startsWith(ROOT + sep)) return null; // no escaping public/
  try {
    const st = statSync(path);
    if (st.isDirectory()) return fileFor(join(urlPath, "index.html"));
    return path;
  } catch { return null; }
}

createServer((req, res) => {
  const path = fileFor(req.url ?? "/");
  if (!path) {
    res.writeHead(404, { "content-type": "text/plain" }).end("404 Not Found");
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
    "cache-control": "no-store", // always see the latest build
  });
  createReadStream(path).pipe(res);
}).on("error", (err) => {
  console.error(err.code === "EADDRINUSE"
    ? `Port ${PORT} is already in use by another process. Pick another: node scripts/serve.mjs <port>`
    : `serve: ${err.message}`);
  process.exit(1);
}).listen(PORT, HOST, () => {
  console.log(`Serving public/ at ${URL_}  (Ctrl+C to stop)`);
  if (OPEN) {
    const [cmd, cmdArgs] = process.platform === "win32" ? ["cmd", ["/c", "start", "", URL_]]
      : process.platform === "darwin" ? ["open", [URL_]] : ["xdg-open", [URL_]];
    spawn(cmd, cmdArgs, { stdio: "ignore", detached: true }).unref();
  }
});
