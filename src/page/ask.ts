/* "Ask the catalog" widget (T61).
 *
 * An OPTIONAL chat box on the orient surface that POSTs a plain-language question
 * to a configurable structured-RAG backend and renders the grounded answer with
 * **cited model deep-links** — each returned citation id resolves to the T17 drawer
 * (`#vendor/id`, opened by the hash router in controls.ts). It stays HIDDEN unless
 * `#ask[data-ask-endpoint]` is set: an empty attribute → the section never shows and
 * the site stays fully self-contained + zero-dep. The literal value "default" targets
 * the turing-demo.viglet.org catalog copilot; any other value is used verbatim. No API
 * key ever lives in the page — the backend holds it; the widget only sends the question. */
import { byId, esc, elClosest } from "./dom.js";
import { state } from "./state.js";
import { vendorLabel } from "./format.js";

/** Default backend when `data-ask-endpoint="default"` — Turing ES's catalog copilot. */
const DEFAULT_ASK_ENDPOINT = "https://turing-demo.viglet.org/api/sn/model-catalog/copilot";

/** Locale sent with the question. It must match the backend SN **site-instance**
 * locale (the catalog is ingested under en-US), NOT the visitor's browser language:
 * retrieval is locale-scoped, so a mismatched locale (e.g. a pt-BR browser) returns
 * zero hits and the copilot answers "no matching results" to every question. Override
 * via `#ask[data-ask-locale]` if a backend indexes the catalog under another locale. */
const DEFAULT_ASK_LOCALE = "en-US";

/** Example prompts when qa-eval.jsonl (T62) isn't reachable (offline / not emitted). */
const FALLBACK_EXAMPLES = [
  "Which embedding model has the lowest price?",
  "Which chat model has the largest context window?",
  "List open-weight chat models I can self-host.",
];

interface QaLine {
  question?: string;
  example?: boolean;
}

/** A returned citation, normalised from the backend's shape. */
interface Citation {
  id: string;
  title?: string;
  url?: string;
}

let busy = false;

/** Multi-turn conversation state (T63). `wire` is what the backend sees — only the
 * user turns and SUCCESSFUL assistant answers (errors are shown but not replayed as
 * context); `items` is the rendered chat bubbles, newest last. */
interface ChatMsg { role: "user" | "assistant"; content: string; }
const wire: ChatMsg[] = [];
const items: string[] = [];

/** Resolve the configured endpoint: empty/unset → null (stay hidden). */
function resolveEndpoint(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  return v === "default" ? DEFAULT_ASK_ENDPOINT : v;
}

/** Name the destination in the privacy note (T74) so the disclosure is accurate
 * for whatever endpoint is configured — the default backend by name, otherwise
 * the configured host. The widget only shows when an endpoint is set, so a
 * visible note always means the question leaves the page. */
function setAskDestination(endpoint: string): void {
  const dest = byId("ask-dest");
  if (!dest) return;
  if (endpoint === DEFAULT_ASK_ENDPOINT) {
    dest.textContent = "Viglet Turing ES (turing-demo.viglet.org)";
  } else {
    try { dest.textContent = new URL(endpoint).host; } catch { /* leave the generic wording */ }
  }
}

export function initAsk(): void {
  const section = byId("ask");
  const endpoint = resolveEndpoint(section.dataset.askEndpoint);
  if (!endpoint) return; // no endpoint configured → self-contained, section stays hidden
  const locale = (section.dataset.askLocale ?? "").trim() || DEFAULT_ASK_LOCALE;
  section.hidden = false;
  setAskDestination(endpoint); // name where the question goes (privacy note, T74)
  loadExamples();
  const qEl = byId("ask-q");
  autoGrow(); // size to one line at load (no stray scrollbar before first input)
  qEl.addEventListener("input", autoGrow);
  // The box is a textarea, so Enter alone would insert a newline — submit on
  // Enter and reserve Shift+Enter for a deliberate line break.
  qEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(endpoint, locale, qEl.value); }
  });
  byId("ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    ask(endpoint, locale, qEl.value);
  });
  byId("ask-examples").addEventListener("click", (e) => {
    const chip = elClosest(e, "[data-q]");
    if (!chip) return;
    const q = chip.dataset.q ?? "";
    qEl.value = q;
    autoGrow();
    ask(endpoint, locale, q);
  });
  byId("ask-clear").addEventListener("click", resetConversation);
}

/** Reset to the initial state: empty thread, example chips back, empty input. */
function resetConversation(): void {
  if (busy) return;
  items.length = 0;
  wire.length = 0;
  const answer = byId("ask-answer");
  answer.innerHTML = "";
  answer.hidden = true;
  byId("ask-clear").hidden = true;
  byId("ask-examples").hidden = false;
  const qEl = byId("ask-q");
  qEl.value = "";
  autoGrow();
  qEl.focus();
}

/** Grow the question textarea to fit its content (capped by its CSS max-height).
 * With border-box, height must include the border or the box is a couple px short
 * and a scrollbar shows even when the text fits — so add the border, and only turn
 * on the scrollbar once the content actually exceeds the max-height. */
function autoGrow(): void {
  const el = byId("ask-q");
  el.style.height = "auto";
  const cs = getComputedStyle(el);
  const border = Number.parseFloat(cs.borderTopWidth || "0") + Number.parseFloat(cs.borderBottomWidth || "0");
  const max = Number.parseFloat(cs.maxHeight || "") || Infinity;
  const target = el.scrollHeight + border;
  el.style.height = Math.min(target, max) + "px";
  el.style.overflowY = target > max ? "auto" : "hidden";
}

/** Seed the example-prompt chips from the published qa-eval.jsonl (T62). */
async function loadExamples(): Promise<void> {
  let questions: string[] = [];
  try {
    const r = await fetch("./qa-eval.jsonl");
    if (r.ok) {
      questions = (await r.text())
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l): QaLine | null => { try { return JSON.parse(l) as QaLine; } catch { return null; } })
        .filter((o): o is QaLine => !!o && o.example === true && typeof o.question === "string")
        .map((o) => o.question as string);
    }
  } catch { /* offline / not emitted → fall back */ }
  if (!questions.length) questions = FALLBACK_EXAMPLES;
  renderExamples(questions.slice(0, 6));
}

function renderExamples(questions: string[]): void {
  byId("ask-examples").innerHTML =
    `<span class="ask-ex-label">Try</span>` +
    questions.map((q) => `<button type="button" class="ask-ex" data-q="${attr(q)}">${esc(q)}</button>`).join("");
}

/** Escape a value for an HTML double-quoted attribute (esc handles & and <). */
function attr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}

/** A chat bubble. User turns are the plain question; assistant turns wrap the
 * rendered answer (markdown + citations). */
function turnHtml(role: "user" | "assistant", inner: string): string {
  return `<div class="ask-turn ${role}"><div class="ask-bubble">${inner}</div></div>`;
}
/** Repaint the whole conversation into #ask-answer — the turns so far, an optional
 * pending "…" assistant bubble, and the single grounding caveat footer. */
function renderThread(pending: boolean): void {
  const answer = byId("ask-answer");
  const spinner = pending
    ? turnHtml("assistant", `<div class="ask-loading"><span class="ask-spin" aria-hidden="true"></span> Asking the catalog…</div>`)
    : "";
  answer.innerHTML =
    `<div class="ask-thread">${items.join("")}${spinner}</div>` +
    `<p class="ask-caveat lbl">Grounded on the catalog — figures are indicative / cited, verify at the source. Click a cited model to open its full record.</p>`;
  // A prior answer can be very tall, so a new turn lands far below the fold — bring
  // the latest question into view so the thread visibly advances (T63).
  const turns = answer.querySelectorAll(".ask-turn.user");
  const latest = turns[turns.length - 1];
  if (latest) latest.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function ask(endpoint: string, locale: string, raw: string): Promise<void> {
  const q = raw.trim();
  const qEl = byId("ask-q");
  if (!q) { qEl.focus(); return; }
  if (busy) return;
  busy = true;
  byId("ask-send").disabled = true;
  // Show the question immediately as a chat bubble, clear the box for the next turn.
  items.push(turnHtml("user", esc(q)));
  wire.push({ role: "user", content: q });
  qEl.value = ""; autoGrow();
  byId("ask-examples").hidden = true; // starters give way to the conversation
  byId("ask-clear").hidden = false;   // offer a reset once a conversation exists
  byId("ask-answer").hidden = false;
  renderThread(true);
  try {
    // The catalog-copilot contract (Turing TurSNCatalogCopilotAPI): the full
    // multi-turn conversation so far + the site-instance locale (DEFAULT_ASK_LOCALE).
    // No API key: the backend holds it.
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ messages: wire, locale }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    wire.push({ role: "assistant", content: extractText(asRecord(data)) });
    items.push(turnHtml("assistant", renderAnswer(data)));
    renderThread(false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Show the failure in the thread but DON'T replay it to the backend as context.
    items.push(turnHtml("assistant",
      `<div class="ask-error">Couldn't reach the answer backend (${esc(msg)}). ` +
      `The catalog itself is fully browsable — try <a href="#browse">Explore</a> or press <kbd>⌘K</kbd>.</div>`));
    renderThread(false);
  } finally {
    busy = false;
    byId("ask-send").disabled = false;
    qEl.focus();
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Tolerant answer-text extraction — the backend contract is still stabilising. */
function extractText(data: Record<string, unknown>): string {
  for (const k of ["answer", "text", "message", "output", "response", "content"]) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  const choices = data.choices; // OpenAI-ish shape
  if (Array.isArray(choices) && choices.length) {
    const content = asRecord(asRecord(choices[0]).message).content;
    if (typeof content === "string") return content;
  }
  return "";
}

/** Tolerant citation extraction → normalised { id, title?, url? } list.
 * The catalog-copilot returns `citations: [{ rank, id, title, url, score }]`; the
 * fallbacks cover other backends / shapes while the contract stabilises. */
function extractCitations(data: Record<string, unknown>): Citation[] {
  const out: Citation[] = [];
  for (const k of ["citations", "sources", "models", "results", "cited"]) {
    const arr = data[k];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === "string") { out.push({ id: item }); continue; }
      const o = asRecord(item);
      const vendor = typeof o.vendor === "string" ? o.vendor : null;
      const rawId = [o.id, o.modelId, o.key].find((x) => typeof x === "string") as string | undefined;
      if (!rawId) continue;
      out.push({
        id: vendor && !rawId.includes("/") ? `${vendor}/${rawId}` : rawId,
        title: typeof o.title === "string" ? o.title : undefined,
        url: typeof o.url === "string" ? o.url : undefined,
      });
    }
    if (out.length) break;
  }
  return out;
}

/** Map a returned citation to a catalog key ("vendor/id"), or null if unresolved/ambiguous. */
function resolveKey(cit: string): string | null {
  if (state.byKey.has(cit)) return cit;
  const matches: string[] = [];
  for (const key of state.byKey.keys()) {
    if (key.slice(key.indexOf("/") + 1) === cit) matches.push(key); // bare id → its vendor/id
  }
  return matches.length === 1 ? matches[0] : null;
}

/** Render one citation as a numbered chip: a deep-link into the drawer when the id
 * resolves, else the backend's own url/title, else plain text — so a claim always
 * shows its evidence. The leading number is the footnote `n` that the inline `[n]`
 * markers (T77) point at — chip and marker share it (the citations array is 1-based
 * in answer order, guaranteed by Turing T800). */
function citeChip(c: Citation, n: number): string {
  const num = `<span class="ask-cite-num">${n}</span>`;
  const key = resolveKey(c.id);
  if (key) {
    const m = state.byKey.get(key)!;
    return `<a class="ask-cite" href="#${encodeURI(key)}">${num}<span class="mid">${esc(m.id)}</span> <span class="lbl">${esc(vendorLabel(m.vendor))}</span></a>`;
  }
  const label = esc(c.title || c.id);
  return c.url
    ? `<a class="ask-cite" href="${esc(c.url)}" target="_blank" rel="noopener">${num}${label} <span class="lbl">↗</span></a>`
    : `<span class="ask-cite ask-cite-plain">${num}${label}</span>`;
}

/** T77 — turn each compact `[n]` footnote the copilot emits into a superscript
 * citation linking to the n-th cited model (the T17 drawer when the id resolves,
 * else the backend's own url, else a bare number). `cites` is 1-based in answer
 * order (Turing T800), so `[n]` → `cites[n-1]`; a marker with no backing citation
 * is left as plain text. Runs on the already-escaped, Markdown-rendered HTML —
 * `[1]` survives both esc() and mdInline() untouched, so this is the only place
 * that consumes it. */
function linkCitations(html: string, cites: Citation[]): string {
  if (!cites.length) return html;
  return html.replace(/\[(\d{1,4})\]/g, (marker, digits: string) => {
    const c = cites[Number(digits) - 1];
    if (!c) return marker; // dangling footnote — no such citation, leave as text
    const key = resolveKey(c.id);
    const href = key ? `#${encodeURI(key)}` : (c.url || null);
    if (!href) return `<sup class="ask-cite-ref ask-cite-ref-plain">${digits}</sup>`;
    const title = key ? state.byKey.get(key)!.id : (c.title || c.id);
    const ext = key ? "" : ` target="_blank" rel="noopener"`;
    return `<a class="ask-cite-ref" href="${esc(href)}"${ext} title="${attr(title)}">${digits}</a>`;
  });
}

/** Defensive: strip any narrative source label the model still emits despite the
 * prompt (Turing T800 forbids `[Source: …]` — the `[n]` footnotes are the only
 * citation form). Consumes a trailing separator so no orphan comma is left behind.
 * A no-op against the fixed backend; resilience against an older/other one. */
function stripSourceLabels(s: string): string {
  return s.replace(/\[\s*sources?\s*:[^\]]*\]\s*,?\s*/gi, " ").replace(/[ \t]{2,}/g, " ");
}

/* Minimal, safe Markdown → HTML for the LLM answer (T63). The text is UNTRUSTED
 * (a model wrote it), so it is HTML-escaped FIRST; the inline rules then run on the
 * escaped string and only ever emit a fixed, safe tag set. Links accept http(s)
 * only (no `javascript:`); underscore emphasis is intentionally NOT supported so
 * model ids like `text_embedding_3` aren't mangled — use backticks/`**` instead. */
function mdInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function renderMarkdown(raw: string): string {
  const lines = esc(raw).split(/\r?\n/);
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  let listTag = "ul";
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(mdInline).join("<br>")}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${listTag}>${list.map((li) => `<li>${mdInline(li)}</li>`).join("")}</${listTag}>`); list = null; } };
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) { flushPara(); flushList(); continue; }
    const ul = /^[-*]\s+(.*)/.exec(t);
    const ol = /^\d+\.\s+(.*)/.exec(t);
    if (ul) { flushPara(); if (!list || listTag !== "ul") { flushList(); list = []; listTag = "ul"; } list.push(ul[1]); }
    else if (ol) { flushPara(); if (!list || listTag !== "ol") { flushList(); list = []; listTag = "ol"; } list.push(ol[1]); }
    else { flushList(); para.push(t); }
  }
  flushPara(); flushList();
  return out.join("");
}

function renderAnswer(data: unknown): string {
  const rec = asRecord(data);
  const text = extractText(rec);
  const cites = extractCitations(rec);
  const errMsg = typeof rec.error === "string" ? rec.error : "";

  let body: string;
  if (text) {
    // Render Markdown first, then resolve the [n] footnotes to citation links (T77);
    // strip any stray [Source: …] label the model emitted (Turing T800 forbids them).
    body = `<div class="ask-text">${linkCitations(renderMarkdown(stripSourceLabels(text)), cites)}</div>`;
  } else if (rec.available === false) {
    // The copilot can't run (e.g. no default LLM configured) — surface its reason.
    body = `<div class="ask-error">The catalog copilot is unavailable${errMsg ? ` (${esc(errMsg)})` : ""}. Browse the catalog below or press <kbd>⌘K</kbd>.</div>`;
  } else if (cites.length) {
    // Degraded: retrieval matched rows but no synthesized prose — still show evidence.
    body = `<div class="ask-text"><p class="lbl">No synthesized answer${errMsg ? ` (${esc(errMsg)})` : ""} — here are the matching models.</p></div>`;
  } else {
    body = `<div class="ask-text"><p class="lbl">No answer${errMsg ? ` (${esc(errMsg)})` : ""}.</p></div>`;
  }

  const summary = typeof rec.groundedQuerySummary === "string" && rec.groundedQuerySummary.trim()
    ? `<p class="ask-summary lbl">Interpreted as: ${esc(rec.groundedQuerySummary)}</p>` : "";
  const citeHtml = cites.length
    ? `<div class="ask-cites"><span class="ask-cites-label">Cited models</span><div class="ask-cite-list">${cites.map((c, i) => citeChip(c, i + 1)).join("")}</div></div>`
    : "";
  // The grounding caveat is rendered once as the thread footer (renderThread), not per turn.
  return body + summary + citeHtml;
}
