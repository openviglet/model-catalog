/* The Browse view: filtering, the card render pass, and global sort (T65).
 * T68 replaced the fixed-column table with a responsive card grid — each model
 * shows all of its recorded decision fields, so nothing is clipped by column
 * width and sorting moves to an explicit control (no header cells to click). */
import type { ModelEntry } from "./types.js";
import { byId } from "./dom.js";
import {
  state, collapsed, pinned,
  activeCaps, activeInMods, activeOutMods, activeTags, activeTiers, activeHas,
} from "./state.js";
import {
  KIND_COLOR, KIND_LABEL, TIER_BG, COL_ORDER, PAGE_SIZE,
  NUM_SORT, PRICE_CAVEAT, BENCH_CAVEAT, PERF_CAVEAT,
} from "./constants.js";
import {
  vendorLabel, vendorColor, initials, vendorGlyph, tierBadge, useCaseChips,
  fmtTokens, fmtParams, priceParts, correctionUrl, tierRank, icon,
} from "./format.js";
import { updateRailActive } from "./controls.js";
import { classify } from "../sdk/model-catalog-client.js";

export function passesFilters(m: ModelEntry, q: string) {
  if (state.activeKind && m.kind !== state.activeKind) return false;
  const mc = m.capabilities || [];
  for (const c of activeCaps) if (!mc.includes(c)) return false;
  const im = (m.modalities && m.modalities.input) || [];
  for (const x of activeInMods) if (!im.includes(x)) return false;
  const om = (m.modalities && m.modalities.output) || [];
  for (const x of activeOutMods) if (!om.includes(x)) return false;
  if (activeTags.size || activeTiers.size) {
    const cl = classify(m);
    for (const t of activeTags) if (!cl.tags.includes(t)) return false; // AND
    if (activeTiers.size && !activeTiers.has(cl.tier ?? "")) return false; // OR (one tier per model)
  }
  for (const h of activeHas) if (!HAS_FN[h](m)) return false;            // has-data filters (AND) — T53
  if (!q) return true;
  return (m.id + " " + (m.label || "") + " " + m.vendor).toLowerCase().includes(q);
}
// The numeric decision fields, rendered as label-less value chips (the meaning
// lives in each chip's tooltip). "tags" is qualitative and shown in the chip row.
const FACT_KEYS = COL_ORDER.filter((k) => k !== "tags");
// One model as a minimalist card (T68): identity, one row of qualitative chips
// (kind · tier · use-case), then one row of value chips for every recorded metric
// — no field labels, each chip's tooltip explains it. Absent fields are omitted.
export function cardHtml(m: ModelEntry) {
  const kc = KIND_COLOR[m.kind] || KIND_COLOR.UNKNOWN;
  const cl = classify(m);
  const key = m.vendor + "/" + m.id;
  const label = m.label && m.label !== m.id ? " · " + m.label : "";
  const chips = `<span class="badge" style="--kc:${kc}">${KIND_LABEL[m.kind] || m.kind}</span>${tierBadge(cl.tier)}${useCaseChips(cl.tags)}`;
  const metrics = FACT_KEYS.filter((k) => COLS[k].present(m)).map((k) => {
    const c = COLS[k];
    const title = c.caveat ? `${c.label} — ${c.caveat}` : c.label;
    return `<span class="metric${c.plain ? " plain" : ""}" title="${title}">${icon(c.icon(m))}<span class="mval">${c.value(m)}</span></span>`;
  }).join("");
  const metricsRow = metrics
    ? `<div class="mcard-metrics">${metrics}</div>`
    : `<p class="mcard-none"><a href="${correctionUrl(m)}" target="_blank" rel="noopener">Add data ↗</a></p>`;
  return `<article class="mcard" data-key="${key}" tabindex="0" role="button" aria-label="${m.id}">
    <div class="mcard-top">
      <span class="avatar" style="background:${vendorColor(m.vendor)}">${initials(vendorLabel(m.vendor))}</span>
      <div class="mcard-title">
        <div class="mcard-idrow"><span class="mid">${m.id}</span><a class="permalink" href="#${encodeURI(key)}" title="Copy permalink" aria-label="Permalink to ${m.id}">#</a><button type="button" class="pin" data-pin aria-pressed="${pinned.has(key)}" title="Add to compare" aria-label="Add ${m.id} to compare">⇄</button></div>
        <div class="lbl">${vendorLabel(m.vendor)}${label}</div>
      </div>
    </div>
    <div class="mcard-chips">${chips}</div>
    ${metricsRow}
  </article>`;
}
// The group key for a model under the active group-by (null → single flat list).
export function groupOf(m: ModelEntry): string | null {
  if (state.groupBy === "vendor") return m.vendor;
  if (state.groupBy === "kind") return m.kind;
  if (state.groupBy === "tier") return classify(m).tier || "Unpriced";
  return null;
}
// A collapsible group head, styled like the old vendor card head for each group-by.
export function groupHead(type: string, value: string, count: number) {
  let bg, ini, label;
  if (type === "kind") { bg = KIND_COLOR[value] || KIND_COLOR.UNKNOWN; label = KIND_LABEL[value] || value; ini = label.slice(0, 2); }
  else if (type === "tier") { bg = value === "Unpriced" ? "#64748b" : (TIER_BG[value] || "#64748b"); label = value; ini = value.slice(0, 1); }
  else { bg = vendorColor(value); ini = initials(value); label = vendorLabel(value); }
  const glyph = type === "vendor" ? vendorGlyph(value, 13) : "";
  return `<div class="vendor-head" data-group="${value}">
    <span class="avatar" style="background:${bg}">${ini}</span>
    <h3>${glyph ? glyph + " " : ""}${label}</h3>
    <span class="count">${count} model${count !== 1 ? "s" : ""}</span>
    <span class="chev">▾</span>
  </div>`;
}
export const cardGridFor = (cardsHtml: string) => `<div class="mcard-grid">${cardsHtml}</div>`;

// Reset to the first page, then render — used by every handler that changes the
// filtered/sorted result set (search, kind, facet, group, sort, clear). Paging
// controls call render() directly so they keep the chosen page (T67).
export function resetAndRender() { state.page = 1; render(); }

export function render() {
  if (!state.catalog) return;
  const q = byId("q").value.trim().toLowerCase();
  const list = byId("list");
  list.innerHTML = "";
  // T51: a single flat pass over EVERY model, filtered then sorted once globally —
  // so a sort ranks across all vendors, not just within one card.
  const rows = globalSort(Object.values(state.catalog.vendors).flat().filter((m: ModelEntry) => passesFilters(m, q)));
  const shown = rows.length;
  if (!state.groupBy) {
    // T67: paginate the flat list so the DOM stays light and the page scannable.
    // Grouped views aren't paged — group heads already chunk the list.
    const pages = Math.max(1, Math.ceil(shown / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);
    if (shown) {
      const grid = document.createElement("div");
      grid.className = "mcard-grid";
      grid.innerHTML = pageRows.map(cardHtml).join("");
      list.appendChild(grid);
      if (pages > 1) {
        const nav = document.createElement("nav");
        nav.className = "pager";
        nav.setAttribute("aria-label", "Pagination");
        nav.innerHTML = pagerHtml(state.page, pages);
        list.appendChild(nav);
      }
    }
    byId("status").innerHTML = shown
      ? `Showing <span style="color:var(--brand-3);font-weight:600">${start + 1}–${start + pageRows.length}</span> of <span style="color:var(--brand-3);font-weight:600">${shown}</span> model${shown !== 1 ? "s" : ""}`
      : "No models match your search.";
    updateRailActive();
    return;
  }
  {
    // Partition the already-sorted list, preserving global order within each group;
    // group display order follows first appearance in the sorted list.
    const order: (string | null)[] = [];
    const buckets = new Map<string | null, ModelEntry[]>();
    for (const m of rows) {
      const g = groupOf(m);
      if (!buckets.has(g)) { buckets.set(g, []); order.push(g); }
      buckets.get(g)!.push(m);
    }
    for (const g of order) {
      const items = buckets.get(g)!;
      const gkey = state.groupBy + ":" + g;
      const sec = document.createElement("section");
      sec.className = "vendor" + (collapsed.has(gkey) ? " collapsed" : "");
      sec.innerHTML = groupHead(state.groupBy!, g as string, items.length) + cardGridFor(items.map(cardHtml).join(""));
      (sec.querySelector(".vendor-head") as HTMLElement).onclick = () => {
        collapsed.has(gkey) ? collapsed.delete(gkey) : collapsed.add(gkey);
        render();
      };
      list.appendChild(sec);
    }
  }
  byId("status").innerHTML = shown
    ? `<span style="color:var(--brand-3);font-weight:600">${shown}</span> model${shown !== 1 ? "s" : ""} shown`
    : "No models match your search.";
  updateRailActive();
}

// Windowed page numbers: always first + last + the current ±1, with "…" gaps (T67).
export function pageList(page: number, pages: number): (number | "…")[] {
  const want = new Set<number>([1, pages, page - 1, page, page + 1]);
  const nums = [...want].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of nums) { if (p - prev > 1) out.push("…"); out.push(p); prev = p; }
  return out;
}
export function pagerHtml(page: number, pages: number) {
  const btn = (p: number, label: string, extra = "") =>
    `<button type="button" class="pg-btn" data-page="${p}"${extra}>${label}</button>`;
  const nums = pageList(page, pages).map((p) => {
    if (p === "…") return `<span class="pg-ellipsis" aria-hidden="true">…</span>`;
    const cur = p === page;
    return `<button type="button" class="pg-btn${cur ? " current" : ""}" data-page="${p}"${cur ? ' aria-current="page"' : ""}>${p}</button>`;
  }).join("");
  return btn(page - 1, "‹ Prev", page <= 1 ? " disabled" : "") + nums + btn(page + 1, "Next ›", page >= pages ? " disabled" : "");
}
export const HAS_FN: Record<string, (m: ModelEntry) => boolean> = {
  price: (m) => !!m.pricing,
  benchmark: (m) => !!(m.benchmarks && m.benchmarks.intelligenceIndex != null),
  speed: (m) => !!(m.performance && m.performance.throughputTps != null),
};
// Each card metric: a tooltip `label` (+ optional `caveat`), a `present` predicate
// (absent fields are omitted from the card, never shown as "—"), and a bare `value`
// string. `plain` renders a neutral chip instead of the orange numeric one.
interface Column { label: string; present: (m: ModelEntry) => boolean; value: (m: ModelEntry) => string; icon: (m: ModelEntry) => string; caveat?: string; plain?: boolean; }
export const COLS: Record<string, Column> = {
  context:      { label: "Context window (tokens)", icon: () => "context", present: (m) => !!m.contextWindow, value: (m) => fmtTokens(m.contextWindow!) },
  output:       { label: "Max output (tokens)", icon: () => "output", present: (m) => !!m.maxOutputTokens, value: (m) => fmtTokens(m.maxOutputTokens!) },
  dims:         { label: "Embedding dimensions", icon: () => "dims", present: (m) => !!m.embeddingDimensions, value: (m) => String(m.embeddingDimensions) },
  price:        { label: "Indicative US list price / 1M — input · output", icon: () => "price", caveat: PRICE_CAVEAT, present: (m) => priceParts(m.pricing).length > 0, value: (m) => priceParts(m.pricing).map(([v]) => v).join(" · ") },
  intelligence: { label: "Intelligence index (cited)", icon: () => "intelligence", caveat: BENCH_CAVEAT, present: (m) => !!(m.benchmarks && m.benchmarks.intelligenceIndex != null), value: (m) => String(m.benchmarks!.intelligenceIndex) },
  speed:        { label: "Throughput (tokens / sec, cited)", icon: () => "speed", caveat: PERF_CAVEAT, present: (m) => !!(m.performance && m.performance.throughputTps != null), value: (m) => m.performance!.throughputTps + " tok/s" },
  params:       { label: "Parameters", icon: () => "params", present: (m) => m.parameters != null, value: (m) => fmtParams(m.parameters!) },
  weights:      { label: "Open weights vs proprietary", icon: (m) => m.openWeights ? "unlock" : "lock", present: (m) => m.openWeights != null, value: (m) => m.openWeights ? "Open" : "Proprietary", plain: true },
};

export function globalSort(rows: ModelEntry[]) {
  const isNum = !!(state.sortKey && NUM_SORT[state.sortKey]);
  const val = (m: ModelEntry): any =>
    state.sortKey === "id" ? m.id.toLowerCase()
    : state.sortKey === "kind" ? (KIND_LABEL[m.kind] || m.kind).toLowerCase()
    : state.sortKey === "tier" ? tierRank(classify(m).tier)
    : isNum ? NUM_SORT[state.sortKey!](m)
    : null;
  return [...rows].sort((a, b) => {
    if (state.sortKey) {
      const va = val(a), vb = val(b);
      if (isNum) {
        // Missing numeric values always sort last, regardless of direction.
        const na = va == null, nb = vb == null;
        if (na && !nb) return 1;
        if (nb && !na) return -1;
        if (!na && !nb) { if (va < vb) return -state.sortDir; if (va > vb) return state.sortDir; }
      } else {
        if (va < vb) return -state.sortDir;
        if (va > vb) return state.sortDir;
      }
    }
    const av = vendorLabel(a.vendor).toLowerCase(), bv = vendorLabel(b.vendor).toLowerCase();
    if (av !== bv) return av < bv ? -1 : 1;   // stable tiebreak: vendor, then id
    return a.id.localeCompare(b.id);
  });
}

