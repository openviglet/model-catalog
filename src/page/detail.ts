/* Detail drawer, comparison view, and the ⌘K command palette (T65). */
import type { ModelEntry, PaletteEntry } from "./types.js";
import { byId, qs, qsa, toast } from "./dom.js";
import { state, pinned, collapsed } from "./state.js";
import { KIND_COLOR, KIND_LABEL, TIER_HINT, KINDS } from "./constants.js";
import {
  vendorLabel, vendorColor, initials, vendorGlyph, tierBadge, useCaseChips,
  weightsLabel, fmtParams, fmtTokens, priceCell, benchmarkCell, performanceCell,
  costPerCapability, correctionUrl,
} from "./format.js";
import { render } from "./table.js";
import { writeCurrentState, buildFilters, buildGroupBy } from "./controls.js";
import { classify } from "../sdk/model-catalog-client.js";

export function openModel(key: string) {
  const m = state.byKey.get(key);
  if (!m) return;
  state.drawerModel = m;
  const av = byId("drawer-avatar");
  av.textContent = initials(m.vendor);
  av.style.background = vendorColor(m.vendor);
  byId("drawer-name").textContent =
    m.label && m.label !== m.id ? m.label : vendorLabel(m.vendor);
  byId("drawer-id").textContent = m.id;
  byId("drawer-body").innerHTML = renderDetail(m);
  const d = byId("drawer");
  d.classList.add("open"); d.setAttribute("aria-hidden", "false");
  byId("dbackdrop").classList.add("show");
  d.focus();
  // Sync the Browse row only when it's already on screen (drawer opened from the
  // table). Opened from the Decide chart/leaderboards — which sit above Browse —
  // the card is below the fold: just show the drawer, don't yank the page down.
  const el = qs(`.mcard[data-key="${CSS.escape(key)}"]`);
  if (el) {
    const r = el.getBoundingClientRect();
    const inView = r.top < window.innerHeight && r.bottom > 0;
    if (inView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("row-hl"); el.getBoundingClientRect(); el.classList.add("row-hl");
  }
}
export function hideDrawer() {
  const d = byId("drawer");
  if (!d.classList.contains("open")) return;
  d.classList.remove("open"); d.setAttribute("aria-hidden", "true");
  byId("dbackdrop").classList.remove("show");
  state.drawerModel = null;
}
// Explicit user close (✕ / Esc / backdrop): also strip #vendor/id back to the
// list state so the same row can be reopened and the URL reflects the list.
export function closeDrawerByUser() {
  if (!byId("drawer").classList.contains("open")) return;
  hideDrawer();
  writeCurrentState();
}
// Deep-link to the "Propose or correct a model" issue form, pre-filled with
// this model's vendor + id (query params match the form field ids). T28.
export function renderDetail(m: ModelEntry) {
  const rows: string[] = [];
  const add = (dt: string, dd: string | number | null | undefined) => { if (dd || dd === 0) rows.push(`<dt>${dt}</dt><dd>${dd}</dd>`); };
  const chips = (xs: string[]) => xs.map((x) => `<span class="chip">${x}</span>`).join(" ");
  const kc = KIND_COLOR[m.kind] || KIND_COLOR.UNKNOWN;
  const cl = classify(m);
  add("Vendor", `${vendorGlyph(m.vendor, 12)} ${vendorLabel(m.vendor)} <span class="lbl">${m.vendor}</span>`);
  add("Kind", `<span class="badge" style="--kc:${kc}">${KIND_LABEL[m.kind] || m.kind}</span>`);
  add("Use case", useCaseChips(cl.tags));
  if (cl.tier) add('Tier <span class="lbl">by list price</span>', `${tierBadge(cl.tier)} <span class="lbl">${TIER_HINT}</span>`);
  if (m.contextWindow) add("Context window", `<span class="mono">${m.contextWindow.toLocaleString("en-US")}</span> tokens <span class="lbl">(${fmtTokens(m.contextWindow)})</span>`);
  if (m.maxOutputTokens) add("Max output", `<span class="mono">${m.maxOutputTokens.toLocaleString("en-US")}</span> tokens <span class="lbl">(${fmtTokens(m.maxOutputTokens)})</span>`);
  if (m.embeddingDimensions) add("Embedding dims", `<span class="mono">${m.embeddingDimensions}</span>`);
  if (m.openWeights != null) add("Weights", `<span class="chip">${weightsLabel(m)}</span>`);
  if (m.parameters != null) add("Parameters", `<span class="mono">${fmtParams(m.parameters)}</span> <span class="lbl">${m.parameters.toLocaleString("en-US")}</span>`);
  if (m.pricing) add('Price <span class="lbl">US list</span>', priceCell(m.pricing));
  if (m.benchmarks) add('Benchmarks <span class="lbl">cited</span>', benchmarkCell(m.benchmarks));
  if (m.performance) add('Speed <span class="lbl">cited</span>', performanceCell(m.performance));
  { const cpc = costPerCapability(m); if (cpc) add('Value <span class="lbl">derived</span>', cpc); }
  if (m.status) add("Status", m.status);
  if (m.knowledgeCutoff) add("Knowledge cutoff", m.knowledgeCutoff);
  if (m.releaseDate) add("Release date", m.releaseDate);
  if (m.modalities && m.modalities.input && m.modalities.input.length) add("Input", chips(m.modalities.input));
  if (m.modalities && m.modalities.output && m.modalities.output.length) add("Output", chips(m.modalities.output));
  if (m.aliases && m.aliases.length) add("Aliases", chips(m.aliases));
  const caps = (m.capabilities || []).length
    ? `<div class="dsection-label">Capabilities</div><div style="margin-bottom:1.4rem">${chips(m.capabilities || [])}</div>`
    : "";
  const srcs = (m.sources || []).map((s) => `<span class="src">${s}</span>`).join("");
  const prov = `<div class="prov">
      <h4>Provenance</h4>
      <div style="margin-bottom:.5rem">${srcs || '<span class="lbl">—</span>'}</div>
      <div class="lbl">Last verified: ${m.lastVerified || "unknown"}</div>
    </div>`;
  const cmpOn = pinned.has(m.vendor + "/" + m.id);
  return `<div class="drawer-actions">
      <button type="button" class="mini-btn" data-copy-id>⧉ Copy id</button>
      <button type="button" class="mini-btn" data-copy-json>{ } Copy JSON</button>
      <button type="button" class="mini-btn" data-pin-drawer aria-pressed="${cmpOn}">${cmpOn ? "✓ Comparing" : "⇄ Compare"}</button>
      <a class="mini-btn" href="${correctionUrl(m)}" target="_blank" rel="noopener" title="Propose a correction to this model">✎ Correct</a>
    </div>
    <dl class="dl">${rows.join("")}</dl>
    ${caps}
    ${prov}`;
}

export function togglePin(key: string) {
  if (pinned.has(key)) pinned.delete(key);
  else if (pinned.size >= 4) { toast("Compare up to 4 models"); return; }
  else pinned.add(key);
  syncPinButtons(); updateTray();
}
export function unpin(key: string) {
  pinned.delete(key); syncPinButtons(); updateTray();
  if (!byId("compare-modal").classList.contains("show")) return;
  if (pinned.size >= 2) {
    byId("compare-body").innerHTML = renderCompare([...pinned]);
    history.replaceState(null, "", "#compare=" + [...pinned].map(encodeURIComponent).join(","));
  } else {
    closeCompareByUser();
  }
}
export function syncPinButtons() {
  qsa("[data-pin]").forEach((b) => {
    const card = b.closest("[data-key]");
    if (card) b.setAttribute("aria-pressed", String(pinned.has((card as HTMLElement).dataset.key ?? "")));
  });
}
export function updateTray() {
  const chips = byId("tray-chips");
  chips.innerHTML = [...pinned].map((k) => {
    const m = state.byKey.get(k);
    const nm = m ? (m.label && m.label !== m.id ? m.label : m.id) : k;
    return `<span class="tchip">${nm}<button type="button" data-unpin="${k}" aria-label="Remove from compare">✕</button></span>`;
  }).join("");
  byId("tray-label").textContent = `Compare (${pinned.size})`;
  const go = byId("tray-go");
  go.disabled = pinned.size < 2;
  byId("compare-tray").classList.toggle("show", pinned.size > 0);
}
export function openCompare(keys: string[]) {
  const valid = keys.filter((k) => state.byKey.has(k)).slice(0, 4);
  if (valid.length < 2) return;
  pinned.clear(); valid.forEach((k) => pinned.add(k));
  syncPinButtons(); updateTray(); hideDrawer();
  byId("compare-body").innerHTML = renderCompare(valid);
  byId("compare-modal").classList.add("show");
  byId("cbackdrop").classList.add("show");
}
export function hideCompare() {
  byId("compare-modal").classList.remove("show");
  byId("cbackdrop").classList.remove("show");
}
export function closeCompareByUser() {
  if (!byId("compare-modal").classList.contains("show")) return;
  hideCompare(); writeCurrentState();
}
export function renderCompare(keys: string[]) {
  const models = keys.map((k) => ({ k, m: state.byKey.get(k) })).filter((x): x is { k: string; m: ModelEntry } => !!x.m);
  const chips = (xs?: string[]) => (xs || []).map((x) => `<span class="chip">${x}</span>`).join(" ");
  const tokens = (n?: number | null) => n ? `${fmtTokens(n)} <span class="lbl">${n.toLocaleString("en-US")}</span>` : "";
  const spec: Array<[string, (row: { k: string; m: ModelEntry }) => string]> = [
    ["Vendor", ({ m }) => vendorLabel(m.vendor)],
    ["Kind", ({ m }) => `<span class="badge" style="--kc:${KIND_COLOR[m.kind] || KIND_COLOR.UNKNOWN}">${KIND_LABEL[m.kind] || m.kind}</span>`],
    ["Use case", ({ m }) => useCaseChips(classify(m).tags)],
    ["Tier", ({ m }) => tierBadge(classify(m).tier)],
    ["Context window", ({ m }) => tokens(m.contextWindow)],
    ["Max output", ({ m }) => tokens(m.maxOutputTokens)],
    ["Embedding dims", ({ m }) => m.embeddingDimensions ? `<span class="mono">${m.embeddingDimensions}</span>` : ""],
    ["Weights", ({ m }) => m.openWeights == null ? "" : `<span class="chip">${weightsLabel(m)}</span>`],
    ["Parameters", ({ m }) => m.parameters != null ? `<span class="mono">${fmtParams(m.parameters)}</span>` : ""],
    ["Price (US list)", ({ m }) => m.pricing ? priceCell(m.pricing) : ""],
    ["Benchmarks (cited)", ({ m }) => m.benchmarks ? benchmarkCell(m.benchmarks) : ""],
    ["Speed (cited)", ({ m }) => m.performance ? performanceCell(m.performance) : ""],
    ["Value (derived)", ({ m }) => costPerCapability(m)],
    ["Input", ({ m }) => chips(m.modalities && m.modalities.input)],
    ["Output", ({ m }) => chips(m.modalities && m.modalities.output)],
    ["Capabilities", ({ m }) => chips(m.capabilities)],
    ["Status", ({ m }) => m.status || ""],
    ["Knowledge cutoff", ({ m }) => m.knowledgeCutoff || ""],
    ["Release date", ({ m }) => m.releaseDate || ""],
    ["Sources", ({ m }) => chips(m.sources)],
    ["Last verified", ({ m }) => m.lastVerified || ""],
  ];
  const head = `<tr><th scope="row"></th>${models.map(({ k, m }) => `
      <th scope="col"><div class="cmp-model">
        <span class="avatar" style="background:${vendorColor(m.vendor)}">${initials(m.vendor)}</span>
        <span><span class="nm">${m.label && m.label !== m.id ? m.label : m.id}</span><code>${m.id}</code></span>
        <button type="button" class="cmp-remove" data-unpin="${k}" aria-label="Remove from comparison">✕</button>
      </div></th>`).join("")}</tr>`;
  const body = spec.map(([label, get]) => {
    const cells = models.map(get);
    if (cells.every((c) => !c)) return "";   // hide a row no pinned model has
    return `<tr><th scope="row">${label}</th>${cells.map((c) => `<td>${c || '<span class="lbl">—</span>'}</td>`).join("")}</tr>`;
  }).join("");
  return `<table class="cmp"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

export function buildPaletteIndex() {
  state.palIndex = [];
  const present = new Set<string>();
  for (const [v, ms] of Object.entries(state.catalog!.vendors)) {
    state.palIndex.push({ type: "vendor", vendor: v, text: (vendorLabel(v) + " " + v).toLowerCase() });
    for (const m of ms) {
      present.add(m.kind);
      state.palIndex.push({
        type: "model", key: v + "/" + m.id, id: m.id, label: m.label, vendor: v, kind: m.kind,
        text: (m.id + " " + (m.label || "") + " " + vendorLabel(v) + " " + v).toLowerCase(),
      });
    }
  }
  for (const k of KINDS) if (present.has(k)) state.palIndex.unshift({ type: "kind", kind: k, text: ("kind " + KIND_LABEL[k] + " " + k).toLowerCase() });
}
// Subsequence fuzzy match: -1 if q not a subsequence of hay, else higher = better.
export function fuzzyScore(hay: string, q: string) {
  let hi = 0, score = 0, streak = 0;
  for (const ch of q) {
    const idx = hay.indexOf(ch, hi);
    if (idx < 0) return -1;
    if (idx === hi) { streak++; score += 2 + streak; } else { streak = 0; score += 1; }
    hi = idx + 1;
  }
  return score - hay.length * 0.04;   // nudge shorter matches up
}
export function palSearch(raw: string): PaletteEntry[] {
  const q = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return state.palIndex.filter((e) => e.type !== "model").slice(0, 40);   // quick jumps: kinds + vendors
  const scored: [number, PaletteEntry][] = [];
  for (const e of state.palIndex) { const s = fuzzyScore(e.text, q); if (s >= 0) scored.push([s, e]); }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, 40).map((x) => x[1]);
}
export function renderPalette() {
  state.palResults = palSearch(byId("pal-q").value);
  state.palActive = 0;
  const ul = byId("pal-results");
  if (!state.palResults.length) { ul.innerHTML = `<li class="pal-empty">No matches</li>`; return; }
  ul.innerHTML = state.palResults.map((e, i) => {
    let ic, cls, title, sub, bg = "";
    if (e.type === "model") { ic = "◈"; cls = "model"; title = e.label && e.label !== e.id ? e.label : e.id; sub = `<code>${e.id}</code> · ${vendorLabel(e.vendor!)}`; }
    else if (e.type === "vendor") { ic = initials(e.vendor!); cls = "vendor"; title = vendorLabel(e.vendor!); sub = `${vendorGlyph(e.vendor!, 10)} Vendor`; bg = ` style="background:${vendorColor(e.vendor!)}"`; }
    else { ic = "⬡"; cls = "kind"; title = KIND_LABEL[e.kind!] || e.kind; sub = "Kind filter"; }
    return `<li role="option" data-i="${i}" aria-selected="${i === 0}" class="pal-item${i === 0 ? " active" : ""}">
        <span class="pal-ic ${cls}"${bg}>${ic}</span>
        <span class="pal-main"><span class="pal-title">${title}</span><span class="pal-sub">${sub}</span></span>
      </li>`;
  }).join("");
}
export function palMove(d: number) {
  if (!state.palResults.length) return;
  state.palActive = (state.palActive + d + state.palResults.length) % state.palResults.length;
  const items = [...qsa("#pal-results .pal-item")];
  items.forEach((el, i) => { el.classList.toggle("active", i === state.palActive); el.setAttribute("aria-selected", String(i === state.palActive)); });
  items[state.palActive].scrollIntoView({ block: "nearest" });
}
export function openPalette() {
  byId("palette").classList.add("show");
  byId("pbackdrop").classList.add("show");
  const i = byId("pal-q"); i.value = ""; renderPalette(); i.focus();
}
export function closePalette() {
  byId("palette").classList.remove("show");
  byId("pbackdrop").classList.remove("show");
}
// A palette pick is a thin UI over existing state: models → permalink (opens drawer),
// kinds → the kind filter, vendors → scroll to that vendor's section.
export function selectEntry(e: PaletteEntry) {
  closePalette();
  if (e.type === "model") { location.hash = "#" + encodeURI(e.key!); return; }
  hideDrawer(); hideCompare();
  if (e.type === "kind") {
    state.activeKind = e.kind!; byId("q").value = ""; buildFilters(); render(); writeCurrentState();
    byId("browse").scrollIntoView({ behavior: "smooth" });
    return;
  }
  state.activeKind = null; byId("q").value = "";
  state.groupBy = "vendor"; collapsed.delete("vendor:" + e.vendor);   // ensure the vendor's group head exists to scroll to
  buildFilters(); buildGroupBy(); render(); writeCurrentState();
  const vh = qs(`.vendor-head[data-group="${CSS.escape(e.vendor!)}"]`);
  if (vh) vh.scrollIntoView({ behavior: "smooth", block: "center" });
}

