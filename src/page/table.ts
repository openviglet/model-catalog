/* The Browse table: filtering, columns, the render pass, and global sort (T65). */
import type { ModelEntry } from "./types.js";
import { byId } from "./dom.js";
import {
  state, collapsed, pinned,
  activeCaps, activeInMods, activeOutMods, activeTags, activeTiers, activeHas,
} from "./state.js";
import {
  KIND_COLOR, KIND_LABEL, TIER_BG, NUMERIC_COLS, DEFAULT_COLS, PAGE_SIZE,
  NUM_SORT, PRICE_CAVEAT, BENCH_CAVEAT, PERF_CAVEAT,
} from "./constants.js";
import {
  vendorLabel, vendorColor, initials, vendorGlyph, tierBadge, useCaseChips,
  fmtTokens, fmtParams, numChip, priceParts, correctionUrl, tierRank,
} from "./format.js";
import { updateRailActive, writeCurrentState } from "./controls.js";
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
// One row of the model table: model + kind, then the active decision columns (T52).
export function rowHtml(m: ModelEntry) {
  const kc = KIND_COLOR[m.kind] || KIND_COLOR.UNKNOWN;
  const cl = classify(m);
  const key = m.vendor + "/" + m.id;
  // A flat (ungrouped) table drops the vendor context of a group head, so show the
  // vendor inline under the id; grouped views already carry it in the head.
  const vend = !state.groupBy ? `<div class="lbl">${vendorLabel(m.vendor)}${m.label && m.label !== m.id ? " · " + m.label : ""}</div>`
    : (m.label && m.label !== m.id ? `<div class="lbl">${m.label}</div>` : "");
  const cells = effectiveCols().map((ck) => `<td class="${NUMERIC_COLS.has(ck) ? "col-num" : ""}" data-label="${COLS[ck].label}">${COLS[ck].cell(m)}</td>`).join("");
  return `<tr data-key="${key}">
    <td>
      <div class="model-cell"><span class="mid">${m.id}</span><a class="permalink" href="#${encodeURI(key)}" title="Copy permalink" aria-label="Permalink to ${m.id}">#</a><button type="button" class="pin" data-pin aria-pressed="${pinned.has(key)}" title="Add to compare" aria-label="Add ${m.id} to compare">⇄</button></div>
      ${vend}
    </td>
    <td class="col-kind" data-label="Kind"><span class="badge" style="--kc:${kc}">${KIND_LABEL[m.kind] || m.kind}</span> ${tierBadge(cl.tier)}</td>
    ${cells}
  </tr>`;
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
export const tableFor = (bodyHtml: string) =>
  `<div class="table-scroll"><table><thead><tr>${theadRow()}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;

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
      const sec = document.createElement("section");
      sec.className = "vendor";
      sec.innerHTML = tableFor(pageRows.map(rowHtml).join(""));
      list.appendChild(sec);
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
      sec.innerHTML = groupHead(state.groupBy!, g as string, items.length) + tableFor(items.map(rowHtml).join(""));
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
export const emptyCell = (m: ModelEntry) => `<a class="empty-cell" href="${correctionUrl(m)}" target="_blank" rel="noopener" title="Not recorded yet — contribute this value">—</a>`;
export const HAS_FN: Record<string, (m: ModelEntry) => boolean> = {
  price: (m) => !!m.pricing,
  benchmark: (m) => !!(m.benchmarks && m.benchmarks.intelligenceIndex != null),
  speed: (m) => !!(m.performance && m.performance.throughputTps != null),
};
export function priceColCell(m: ModelEntry) {
  const bits = priceParts(m.pricing);
  return bits.length ? `<span class="chip num" title="${PRICE_CAVEAT}">${bits.map(([v]) => v).join(" · ")}</span>` : emptyCell(m);
}
export function benchColCell(m: ModelEntry) {
  const v = m.benchmarks && m.benchmarks.intelligenceIndex;
  return v == null ? emptyCell(m) : `<span class="chip num" title="${BENCH_CAVEAT}">${v}</span>`;
}
export function speedColCell(m: ModelEntry) {
  const v = m.performance && m.performance.throughputTps;
  return v == null ? emptyCell(m) : `<span class="chip num" title="${PERF_CAVEAT}">${v} tok/s</span>`;
}
// Each optional column: display cell + (optional) global sort key.
interface Column { label: string; cell: (m: ModelEntry) => string; sort?: string; }
export const COLS: Record<string, Column> = {
  tags:         { label: "Use case",     cell: (m) => useCaseChips(classify(m).tags) || emptyCell(m) },
  context:      { label: "Context",      cell: (m) => m.contextWindow ? numChip(fmtTokens(m.contextWindow)) : emptyCell(m), sort: "context" },
  output:       { label: "Max output",   cell: (m) => m.maxOutputTokens ? numChip(fmtTokens(m.maxOutputTokens)) : emptyCell(m), sort: "output" },
  dims:         { label: "Embed dims",   cell: (m) => m.embeddingDimensions ? numChip(m.embeddingDimensions) : emptyCell(m), sort: "dims" },
  price:        { label: "Price /1M",    cell: (m) => priceColCell(m), sort: "price" },
  intelligence: { label: "Intelligence", cell: (m) => benchColCell(m), sort: "intelligence" },
  speed:        { label: "Speed",        cell: (m) => speedColCell(m), sort: "speed" },
  params:       { label: "Params",       cell: (m) => m.parameters != null ? numChip(fmtParams(m.parameters)) : emptyCell(m), sort: "params" },
  weights:      { label: "Weights",      cell: (m) => m.openWeights == null ? emptyCell(m) : `<span class="chip">${m.openWeights ? "Open" : "Proprietary"}</span>` },
};
export function effectiveCols() {
  if (state.colChoice !== null) return state.colChoice.filter((k) => COLS[k]);
  return (state.activeKind && DEFAULT_COLS[state.activeKind]) || DEFAULT_COLS._;
}

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
export const sortArrow = () => (state.sortDir === 1 ? " ▲" : " ▼");
// Header cell for a column key: "model" | "kind" | one of COL_ORDER.
export function thFor(colKey: string) {
  if (colKey === "model") {
    const on = state.sortKey === "id";
    return `<th class="sortable" data-col="model" role="button" tabindex="0" aria-sort="${on ? (state.sortDir === 1 ? "ascending" : "descending") : "none"}">Model${on ? sortArrow() : ""}</th>`;
  }
  if (colKey === "kind") {
    const onKind = state.sortKey === "kind", onTier = state.sortKey === "tier";
    const aria = onKind || onTier ? (state.sortDir === 1 ? "ascending" : "descending") : "none";
    const label = onTier ? "Tier" + sortArrow() : "Kind" + (onKind ? sortArrow() : "");
    return `<th class="sortable" data-col="kind" role="button" tabindex="0" aria-sort="${aria}" title="Sort by kind, then by price tier">${label}</th>`;
  }
  const c = COLS[colKey];
  const numCls = NUMERIC_COLS.has(colKey) ? " col-num" : "";
  if (!c.sort) return `<th class="${numCls.trim()}">${c.label}</th>`;
  const on = state.sortKey === c.sort;
  return `<th class="sortable${numCls}" data-col="col" data-key="${c.sort}" role="button" tabindex="0" aria-sort="${on ? (state.sortDir === 1 ? "ascending" : "descending") : "none"}">${c.label}${on ? sortArrow() : ""}</th>`;
}
export function theadRow() {
  return thFor("model") + thFor("kind") + effectiveCols().map(thFor).join("");
}
// Cycle a column's sort states (last state clears the sort).
export function stepSort(cycle: string[]) {
  const cur = state.sortKey ? state.sortKey + ":" + state.sortDir : null;
  const i = cycle.indexOf(cur as string);
  const next = i < 0 ? cycle[0] : (i + 1 < cycle.length ? cycle[i + 1] : null);
  if (!next) { state.sortKey = null; state.sortDir = 1; }
  else { const [k, d] = next.split(":"); state.sortKey = k; state.sortDir = +d; }
  resetAndRender(); writeCurrentState(); // re-sort jumps back to the first page (T67)
}
export function onHeader(th: HTMLElement) {
  const col = th.dataset.col;
  if (col === "model") stepSort(["id:1", "id:-1"]);
  else if (col === "kind") stepSort(["kind:1", "kind:-1", "tier:-1", "tier:1"]);
  else if (col === "col") { const k = th.dataset.key ?? ""; stepSort([k + ":-1", k + ":1"]); } // numeric: high→low first
}

