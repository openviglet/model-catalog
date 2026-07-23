/* Facet rail, group-by, column chooser, presets + the URL/hash router (T65). */
import { byId } from "./dom.js";
import {
  state, facetCollapsed,
  activeCaps, activeInMods, activeOutMods, activeTags, activeTiers, activeHas,
} from "./state.js";
import { KINDS, KIND_LABEL, GROUP_OPTS, COL_ORDER, TIER_ORDER, PRESETS } from "./constants.js";
import { render, resetAndRender, effectiveCols, COLS, HAS_FN } from "./table.js";
import { openModel, hideDrawer, openCompare, hideCompare } from "./detail.js";
import { classify } from "../sdk/model-catalog-client.js";

export function writeCurrentState() {
  const q = byId("q").value.trim();
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (state.activeKind) p.set("kind", state.activeKind);
  if (activeCaps.size) p.set("cap", [...activeCaps].join(","));
  if (activeInMods.size) p.set("in", [...activeInMods].join(","));
  if (activeOutMods.size) p.set("out", [...activeOutMods].join(","));
  if (activeTags.size) p.set("tag", [...activeTags].join(","));
  if (activeTiers.size) p.set("tier", [...activeTiers].join(","));
  if (activeHas.size) p.set("has", [...activeHas].join(","));
  if (state.groupBy) p.set("group", state.groupBy);
  if (state.colChoice !== null) p.set("cols", state.colChoice.join(","));
  if (state.sortKey) p.set("sort", state.sortKey + ":" + state.sortDir);
  const hash = p.toString();
  // replaceState: no history entry per keystroke, and never re-fires hashchange
  history.replaceState(null, "", hash ? "#" + hash : location.pathname + location.search);
}
export function setFromParam(set: Set<string>, str: string | null) { set.clear(); (str || "").split(",").filter(Boolean).forEach((x) => set.add(x)); }
export function resetFilters() {
  byId("q").value = ""; state.activeKind = null;
  activeCaps.clear(); activeInMods.clear(); activeOutMods.clear();
  activeTags.clear(); activeTiers.clear(); activeHas.clear();
  state.groupBy = null; state.colChoice = null; state.sortKey = null; state.sortDir = 1;
}
// Route the hash: explorer state (#q=…&kind=…&cap=…&in=…&out=…&tag=…&tier=…&sort=…),
// model permalink (#vendor/id), or a bare section anchor / empty → baseline.
export function applyHash() {
  const rawEnc = location.hash.slice(1);
  if (rawEnc.startsWith("compare=")) {   // shareable comparison #compare=v/id,v/id
    if (!byId("list").children.length) { buildFilters(); buildGroupBy(); buildFacets(); render(); }
    openCompare(rawEnc.slice(8).split(",").map((s) => decodeURIComponent(s)).filter(Boolean));
    return;
  }
  if (rawEnc.includes("=")) {
    hideDrawer(); hideCompare();
    const p = new URLSearchParams(rawEnc);
    byId("q").value = p.get("q") || "";
    const kind = p.get("kind");
    state.activeKind = kind && KINDS.includes(kind) ? kind : null;
    setFromParam(activeCaps, p.get("cap"));
    setFromParam(activeInMods, p.get("in"));
    setFromParam(activeOutMods, p.get("out"));
    setFromParam(activeTags, p.get("tag"));
    setFromParam(activeTiers, p.get("tier"));
    setFromParam(activeHas, p.get("has"));
    const grp = p.get("group");
    state.groupBy = grp && ["vendor", "kind", "tier"].includes(grp) ? grp : null;
    state.colChoice = p.has("cols") ? (p.get("cols") || "").split(",").filter(Boolean).filter((k) => COLS[k]) : null;
    const srt = p.get("sort");
    if (srt) { const [k, d] = srt.split(":"); state.sortKey = k; state.sortDir = +d || 1; } else { state.sortKey = null; state.sortDir = 1; }
    buildFilters(); buildGroupBy(); buildFacets(); resetAndRender();
    return;
  }
  const raw = decodeURIComponent(rawEnc);
  if (raw.includes("/")) {
    // model permalink → make sure the table exists to scroll to, then open the drawer
    hideCompare();
    if (!byId("list").children.length) { buildFilters(); buildGroupBy(); buildFacets(); render(); }
    openModel(raw);
    return;
  }
  hideDrawer(); hideCompare();
  resetFilters();
  buildFilters(); buildGroupBy(); buildFacets(); resetAndRender();
}

export function buildFilters() {
  const f = byId("filters");
  const present = new Set(Object.values(state.catalog!.vendors).flat().map((m) => m.kind));
  const mk = (kind: string | null, label: string) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("aria-pressed", String(state.activeKind === kind));
    b.onclick = () => { state.activeKind = state.activeKind === kind ? null : kind; buildFilters(); resetAndRender(); writeCurrentState(); };
    return b;
  };
  f.innerHTML = "";
  f.appendChild(mk(null, "All"));
  for (const k of KINDS) if (present.has(k)) f.appendChild(mk(k, KIND_LABEL[k]));
}

export function buildGroupBy() {
  const host = byId("groupby");
  host.innerHTML = "";
  const l = document.createElement("span"); l.className = "gb-label"; l.textContent = "Group"; host.appendChild(l);
  for (const [val, label] of GROUP_OPTS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.setAttribute("aria-pressed", String(state.groupBy === val));
    b.onclick = () => { state.groupBy = val; buildGroupBy(); resetAndRender(); writeCurrentState(); };
    host.appendChild(b);
  }
}

export function buildColMenu() {
  const eff = new Set(effectiveCols());
  byId("col-menu").innerHTML =
    COL_ORDER.map((k) => `<label><input type="checkbox" data-col-key="${k}"${eff.has(k) ? " checked" : ""}> ${COLS[k].label}</label>`).join("") +
    `<div class="col-menu-foot"><button type="button" class="linkish" data-cols-default>Reset to default</button></div>`;
}

export function facetChip(label: string, count: number, active: boolean, onToggle: () => void) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "facet-chip";
  b.innerHTML = `${label} <span class="chip-count">${count}</span>`;
  b.setAttribute("aria-pressed", String(active));
  b.onclick = onToggle;
  return b;
}
interface FacetGroup {
  key: string; label: string; mode: string; set: Set<string>; values: string[];
  labelOf?: (v: string) => string; count: (v: string) => number;
}
export function buildFacets() {
  const all = Object.values(state.catalog!.vendors).flat();
  const caps = [...new Set(all.flatMap((m) => m.capabilities || []))].sort();
  const insM = [...new Set(all.flatMap((m) => (m.modalities && m.modalities.input) || []))].sort();
  const outM = [...new Set(all.flatMap((m) => (m.modalities && m.modalities.output) || []))].sort();
  const tags = [...new Set(all.flatMap((m) => classify(m).tags))].sort();
  const tiers = TIER_ORDER.filter((t) => all.some((m) => classify(m).tier === t));
  const groups: FacetGroup[] = [
    { key: "tag", label: "Use case", mode: "AND", set: activeTags, values: tags, count: (v) => all.filter((m) => classify(m).tags.includes(v)).length },
    { key: "tier", label: "Tier", mode: "OR", set: activeTiers, values: tiers, count: (v) => all.filter((m) => classify(m).tier === v).length },
    { key: "has", label: "Has data", mode: "AND", set: activeHas, values: ["price", "benchmark", "speed"], labelOf: (v) => "Has " + v, count: (v) => all.filter((m) => HAS_FN[v](m)).length },
    { key: "cap", label: "Capability", mode: "AND", set: activeCaps, values: caps, count: (v) => all.filter((m) => (m.capabilities || []).includes(v)).length },
    { key: "in", label: "Input", mode: "AND", set: activeInMods, values: insM, count: (v) => all.filter((m) => ((m.modalities && m.modalities.input) || []).includes(v)).length },
    { key: "out", label: "Output", mode: "AND", set: activeOutMods, values: outM, count: (v) => all.filter((m) => ((m.modalities && m.modalities.output) || []).includes(v)).length },
  ];
  const host = byId("facets");
  host.innerHTML = "";
  for (const g of groups) {
    if (!g.values.length) continue;
    const wrapG = document.createElement("div");
    wrapG.className = "facet-rgroup" + (facetCollapsed.has(g.key) ? " collapsed" : "");
    const nActive = g.values.filter((v) => g.set.has(v)).length;
    const head = document.createElement("button");
    head.type = "button"; head.className = "facet-rhead";
    head.innerHTML = `<span class="chev">▾</span><span class="facet-rlabel">${g.label}</span><span class="facet-mode">${g.mode}</span>${nActive ? `<span class="facet-nactive">${nActive}</span>` : ""}`;
    head.onclick = () => { facetCollapsed.has(g.key) ? facetCollapsed.delete(g.key) : facetCollapsed.add(g.key); buildFacets(); };
    wrapG.appendChild(head);
    const chips = document.createElement("div");
    chips.className = "facet-chips";
    for (const v of g.values) {
      chips.appendChild(facetChip(g.labelOf ? g.labelOf(v) : v, g.count(v), g.set.has(v), () => {
        g.set.has(v) ? g.set.delete(v) : g.set.add(v);
        buildFacets(); resetAndRender(); writeCurrentState();
      }));
    }
    wrapG.appendChild(chips);
    host.appendChild(wrapG);
  }
  updateRailActive();
}

export function activeFilterCount() {
  return (byId("q").value.trim() ? 1 : 0) + (state.activeKind ? 1 : 0)
    + activeCaps.size + activeInMods.size + activeOutMods.size + activeTags.size + activeTiers.size + activeHas.size;
}
export function updateRailActive() {
  const n = activeFilterCount();
  byId("rail-active").textContent = n ? `${n} active` : "";
  byId("clear-filters").disabled = n === 0;
  syncRailToggle();
}
// Keep the rail toggle's label + active-count in sync (T67). When the rail is
// collapsed its own "N active" line is hidden, so surface the count on the button.
export function syncRailToggle() {
  const layout = byId("browse-layout");
  const btn = byId("rail-toggle");
  if (!layout || !btn) return;
  const collapsed = layout.classList.contains("rail-collapsed");
  const n = activeFilterCount();
  btn.setAttribute("aria-expanded", String(!collapsed));
  btn.innerHTML = (collapsed ? "☰ Filters" : "◧ Hide filters")
    + (collapsed && n ? ` <span class="chip-count">${n}</span>` : "");
}
export function clearFilters() {
  byId("q").value = "";
  state.activeKind = null;
  activeCaps.clear(); activeInMods.clear(); activeOutMods.clear();
  activeTags.clear(); activeTiers.clear(); activeHas.clear();
  buildFilters(); buildFacets(); resetAndRender(); writeCurrentState();
}
// Curated preset views — each is just a shareable hash of filter/sort/column state,
// so clicking one routes through applyHash exactly like a pasted deep link.
export function buildPresets() {
  byId("presets").innerHTML = PRESETS.map((p) =>
    `<a class="preset" href="#${new URLSearchParams(p.params).toString()}">${p.label}</a>`).join("");
}

