/* Analytics home (dashboard/coverage/plans/sources) + Decide (frontier/leaderboards) (T65). */
import type {
  Stats, Coverage, CoverageBucket, PlansDataset, ProvidersRegistry, Leaderboards, Leaderboard,
} from "./types.js";
import { byId, qs, qsa } from "./dom.js";
import { state } from "./state.js";
import {
  PLAN_VENDOR_LABEL, SOURCE_CAT_LABEL, SOURCE_CAT_ORDER, COV_LABEL, ISSUE_NEW,
  KIND_LABEL, KIND_COLOR,
} from "./constants.js";
import {
  vendorLabel, vendorColor, vendorShape, vendorGlyph, markFill, shapeEl, fmtTokens, initials,
} from "./format.js";

let analyticsActive: string | null = null;

export function selectAnalyticsTab(name: string) {
  analyticsActive = name;
  qsa(".atab").forEach((t) => t.classList.toggle("active", t.dataset.atab === name));
  qsa(".apanel").forEach((p) => { p.hidden = p.dataset.apanel !== name; });
}
export function enableAnalyticsTab(name: string) {
  byId("analytics").hidden = false;
  const tab = qs(`.atab[data-atab="${name}"]`);
  if (tab) tab.hidden = false;
  if (!analyticsActive) selectAnalyticsTab(name); // activate the first one that loads
}

export function svgBars(
  rows: { label: string; value: number; color?: string }[],
  opts: { fmt?: (n: number) => string; max?: number } = {},
) {
  const fmt = opts.fmt || String;
  const mx = opts.max || Math.max(1, ...rows.map((r) => r.value));
  const RH = 24, TOP = 8, LABEL = 104, BAR0 = 112, BARW = 188, VALX = BAR0 + BARW + 8, W = 344;
  const H = TOP * 2 + rows.length * RH;
  const body = rows.map((r, i) => {
    const cy = TOP + i * RH + RH / 2;
    const bh = 12, by = cy - bh / 2;
    const w = r.value > 0 ? Math.max(3, Math.round(BARW * r.value / mx)) : 0;
    const fill = r.color || "var(--brand)";
    // fill via inline style, not the presentation attribute, so CSS var() colors resolve.
    return `<text class="c-l" x="${LABEL}" y="${cy}" text-anchor="end">${r.label}</text>`
      + `<rect class="c-t" x="${BAR0}" y="${by}" width="${BARW}" height="${bh}" rx="3"/>`
      + (w ? `<rect x="${BAR0}" y="${by}" width="${w}" height="${bh}" rx="3" style="fill:${fill}"/>` : "")
      + `<text class="c-v" x="${VALX}" y="${cy}">${fmt(r.value)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" preserveAspectRatio="xMinYMin meet">${body}</svg>`;
}
// Context-window spread — bucketed from the loaded catalog (not in stats.json).
export function contextHistogram() {
  const edges = [8192, 32768, 131072, 1048576];
  const labels = ["≤ 8K", "8–32K", "32–128K", "128K–1M", "≥ 1M"];
  const counts = [0, 0, 0, 0, 0];
  for (const m of Object.values(state.catalog!.vendors).flat()) {
    const cw = m.contextWindow;
    if (!cw) continue;
    let b = edges.findIndex((e) => cw <= e);
    if (b < 0) b = edges.length;
    counts[b]++;
  }
  return labels.map((label, i) => ({ label, value: counts[i], color: "var(--brand)" }));
}
export function renderDashboard(stats: Stats) {
  const card = (title: string, svg: string, note?: string) =>
    `<div class="feat chart-card"><h3>${title}</h3><div class="chart">${svg}</div>${note ? `<p class="chart-note">${note}</p>` : ""}</div>`;
  const rowsOf = (
    obj: Record<string, number>,
    mapLabel: ((k: string) => string) | null,
    colorOf: ((k: string) => string) | null,
  ) =>
    Object.entries(obj).map(([k, v]) => ({ label: mapLabel ? mapLabel(k) : k, value: v, color: colorOf ? colorOf(k) : undefined }));
  const vendorRows = rowsOf(stats.byVendor, (v) => vendorLabel(v), (v) => vendorColor(v));
  const kindRows = Object.entries(stats.byKind).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: KIND_LABEL[k] || k, value: v, color: KIND_COLOR[k] || KIND_COLOR.UNKNOWN }));
  const capRows = rowsOf(stats.byCapability, null, () => "var(--brand-2)");
  const inRows = rowsOf(stats.byInputModality, null, () => "var(--brand-3)");
  // Short labels (avoid clipping long field keys) + drop 0%-filled fields, so the
  // chart matches the T53 hygiene pass in the Coverage matrix. COV_LABEL is defined
  // in the coverage section below (available by the time this runs).
  const covRows = Object.entries(stats.coverage.fields)
    .filter(([, v]) => v.rate > 0)
    .map(([k, v]) => ({ label: COV_LABEL[k] || k, value: v.rate, color: "var(--brand-2)" }))
    .sort((a, b) => b.value - a.value);
  byId("charts").innerHTML =
    card("Models per vendor", svgBars(vendorRows)) +
    card("Models per kind", svgBars(kindRows)) +
    card("Context window", svgBars(contextHistogram()), "Models by max context window") +
    card("Top capabilities", svgBars(capRows)) +
    card("Input modalities", svgBars(inRows)) +
    card("Field coverage", svgBars(covRows, { max: 1, fmt: (v) => Math.round(v * 100) + "%" }),
      `Share of the ${stats.coverage.total} catalogued models carrying each field — the denominator behind every sparse overlay.`);
  enableAnalyticsTab("overview");
}

export function renderFrontier() {
  const chat = Object.values(state.catalog!.vendors).flat().filter((m) => m.kind === "CHAT");
  const pts = chat
    .filter((m) => m.pricing && m.pricing.inputPer1M != null && m.benchmarks && m.benchmarks.intelligenceIndex != null)
    .map((m) => ({ key: m.vendor + "/" + m.id, x: m.pricing!.inputPer1M!, y: m.benchmarks!.intelligenceIndex!,
      label: m.label && m.label !== m.id ? m.label : m.id, vendor: m.vendor }));
  byId("frontier-denom").textContent = `${pts.length} of ${chat.length} chat models with both`;
  const host = byId("frontier");
  if (pts.length < 3) {
    host.innerHTML = `<p class="chart-note">Not enough chat models carry both a price and a cited intelligence index yet — <a href="#contribute">help fill it in</a>.</p>`;
    return false;
  }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minP = Math.min(...xs), maxP = Math.max(...xs), minI = Math.min(...ys), maxI = Math.max(...ys);
  const W = 680, H = 404, ML = 52, MR = 16, MT = 16, MB = 60;
  const plotW = W - ML - MR, plotH = H - MT - MB;
  const lg = Math.log10, lgMin = lg(minP), lgMax = lg(maxP);
  const xPix = (v: number) => ML + (lgMax === lgMin ? 0.5 : (lg(v) - lgMin) / (lgMax - lgMin)) * plotW;
  const yPad = (maxI - minI) * 0.08 || 1, y0 = minI - yPad, y1 = maxI + yPad;
  const yPix = (v: number) => MT + (1 - (v - y0) / (y1 - y0)) * plotH;
  // Pareto frontier: cheapest-first, keep those strictly smarter than all cheaper.
  const front = new Set<string>();
  [...pts].sort((a, b) => a.x - b.x || b.y - a.y).reduce((best: number, p) => {
    if (p.y > best) { front.add(p.key); return p.y; } return best;
  }, -Infinity);
  const fmtP = (v: number) => "$" + (v >= 1000 ? v / 1000 + "k" : v);
  const decades: number[] = [];
  for (let e = Math.floor(lgMin); e <= Math.ceil(lgMax); e++) decades.push(Math.pow(10, e));
  const xAxis = decades.filter((v) => lg(v) >= lgMin - 1e-3 && lg(v) <= lgMax + 1e-3).map((v) =>
    `<line x1="${xPix(v).toFixed(1)}" y1="${MT}" x2="${xPix(v).toFixed(1)}" y2="${MT + plotH}" stroke="var(--border)" stroke-width=".5"/>`
    + `<text class="c-l" x="${xPix(v).toFixed(1)}" y="${H - MB + 15}" text-anchor="middle">${fmtP(v)}</text>`).join("");
  let yAxis = "";
  for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4, yy = yPix(v).toFixed(1);
    yAxis += `<line x1="${ML}" y1="${yy}" x2="${ML + plotW}" y2="${yy}" stroke="var(--border)" stroke-width=".5"/><text class="c-l" x="${ML - 8}" y="${yy}" text-anchor="end">${Math.round(v)}</text>`; }
  const frontPts = pts.filter((p) => front.has(p.key)).sort((a, b) => a.x - b.x);
  const frontLine = frontPts.length > 1
    ? `<polyline points="${frontPts.map((p) => xPix(p.x).toFixed(1) + "," + yPix(p.y).toFixed(1)).join(" ")}" fill="none" stroke="var(--brand)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".7"/>` : "";
  // Each model is drawn in its vendor's colour AND shape (T64) — the composite
  // is what keeps 12 vendors apart where colour alone blurs. Frontier models
  // keep their vendor identity but gain a brand ring + full size/opacity.
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const dots = pts.map((p) => {
    const on = front.has(p.key);
    const cx = xPix(p.x), cy = yPix(p.y), r = on ? 5.5 : 4;
    const title = `<title>${esc(p.label)} — ${esc(vendorLabel(p.vendor))} · $${p.x}/1M in · intelligence ${p.y}${on ? " · on the frontier" : ""}</title>`;
    const attrs = `class="dot mark${on ? " front" : ""}" data-key="${p.key}" data-vendor="${p.vendor}" style="fill:${markFill(vendorColor(p.vendor), dark)};opacity:${on ? 1 : 0.78};stroke:${on ? "var(--brand)" : "var(--mark-edge)"};stroke-width:${on ? 1.8 : 1}"`;
    return shapeEl(vendorShape(p.vendor), cx, cy, r, attrs, title);
  }).join("");
  const labels = `<text class="c-l" x="${ML + plotW / 2}" y="${H - 14}" text-anchor="middle">Input price (US list, $/1M) — log scale</text>`
    + `<text class="c-l" x="13" y="${MT + plotH / 2}" text-anchor="middle" transform="rotate(-90 13 ${MT + plotH / 2})">Intelligence index (cited)</text>`;
  // Legend: only vendors present, most models first; each row is its glyph +
  // label + count and highlights its own dots on hover. Plus the frontier key.
  const counts: Record<string, number> = {};
  pts.forEach((p) => { counts[p.vendor] = (counts[p.vendor] || 0) + 1; });
  const legend = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || vendorLabel(a).localeCompare(vendorLabel(b)))
    .map((v) => `<li class="lg-item" data-vendor="${v}">${vendorGlyph(v)}${vendorLabel(v)} <b>${counts[v]}</b></li>`).join("");
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Price versus cited intelligence scatter of chat models, coloured and shaped by vendor">${yAxis}${xAxis}${frontLine}${dots}${labels}</svg>`
    + `<ul class="chart-legend">${legend}<li class="lg-item lg-front"><span class="lg-ring"></span>On the frontier</li></ul>`;
  // Hover a legend vendor → spotlight its dots (dim the rest).
  const svg = host.querySelector("svg")!, legendEl = host.querySelector(".chart-legend")!;
  legendEl.querySelectorAll(".lg-item[data-vendor]").forEach((item) => {
    const v = (item as HTMLElement).dataset.vendor;
    const spotlight = (on: boolean) => {
      svg.classList.toggle("dim-others", on);
      legendEl.classList.toggle("has-hover", on);
      item.classList.toggle("active", on);
      svg.querySelectorAll(".mark").forEach((m) => m.classList.toggle("on", on && (m as HTMLElement).dataset.vendor === v));
    };
    item.addEventListener("mouseenter", () => spotlight(true));
    item.addEventListener("mouseleave", () => spotlight(false));
  });
  return true;
}

export function lbValue(b: Leaderboard, v: number) {
  if (b.metric.includes("contextWindow")) return fmtTokens(v);
  // Only the cheapest-* boards are a dollar price; intelligence-per-$ also mentions
  // inputPer1M in its metric expression but is an index-points-per-dollar ratio.
  if (b.metric === "pricing.inputPer1M") return "$" + v;
  return v >= 100 ? Math.round(v) : v;
}
// The 9 leaderboards are tucked behind chips (same visual as the analytics tabs)
// so the price×intelligence scatter stays the section's focus instead of being
// buried under a tall grid of tables — only the active board renders (T68).
let lbActive: string | null = null;
export function selectLeaderboardTab(key: string) {
  lbActive = key;
  qsa(".lbtab").forEach((t) => t.classList.toggle("active", t.dataset.lbtab === key));
  qsa(".lbpanel").forEach((p) => { p.hidden = p.dataset.lbpanel !== key; });
}
export function renderLeaderboards(data: Leaderboards | null) {
  if (!data || !Array.isArray(data.leaderboards) || !data.leaderboards.length) return false;
  const tabs = data.leaderboards.map((b, i) =>
    `<button type="button" class="atab lbtab" role="tab" data-lbtab="${i}">${b.label}</button>`).join("");
  const panels = data.leaderboards.map((b, i) => {
    const rows = b.entries.map((e, r) =>
      `<tr data-key="${e.vendor}/${e.id}"><td class="lb-rank">${r + 1}</td><td><span class="mid">${e.id}</span><div class="lbl">${vendorGlyph(e.vendor, 11)} ${vendorLabel(e.vendor)}</div></td><td class="col-num"><span class="chip num">${lbValue(b, e.value)}</span></td></tr>`).join("");
    return `<div class="lbpanel" data-lbpanel="${i}" role="tabpanel" hidden>
      <div class="feat chart-card lb-card"><h3>${b.label} <span class="lbl">${b.population}/${b.total}</span></h3>
      <div class="table-scroll"><table class="lb"><tbody>${rows}</tbody></table></div>
      <p class="chart-note">${b.unit} · ${b.order === "asc" ? "lower is better" : "higher is better"} — indicative/cited, verify at the source</p></div></div>`;
  }).join("");
  byId("lb-tabs").innerHTML = tabs;
  byId("lb-tabs").hidden = false;
  byId("leaderboards").innerHTML = panels;
  selectLeaderboardTab(lbActive ?? "0");
  return true;
}

export function renderPlans(data: PlansDataset) {
  if (!data || !data.plans || !Object.keys(data.plans).length) return;
  const money = (v?: number | null) => (v == null ? null : v === 0 ? "Free" : "$" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const cards = Object.entries(data.plans).map(([vendor, plans]) => {
    const rows = plans.map((p) => {
      const price = money(p.priceMonthlyUSD);
      const priceStr = price == null ? '<span class="lbl">—</span>'
        : price === "Free" ? "Free"
        : `<span class="mono">${price}</span><span class="lbl">/mo</span>`;
      const annual = p.annualMonthlyUSD != null ? ` <span class="lbl">($${p.annualMonthlyUSD}/mo billed annually)</span>` : "";
      const feats = (p.features || []).length ? `<div class="lbl" style="margin-top:.3rem">${(p.features || []).join(" · ")}</div>` : "";
      const prov = `${p.url || p.source ? `<a href="${p.url || p.source}" target="_blank" rel="noopener" style="white-space:nowrap">source ↗</a> ` : ""}<span class="lbl" style="white-space:nowrap">${p.lastVerified || ""}</span>`;
      return `<tr>
        <td><strong>${p.name}</strong>${p.tier ? ` <span class="chip">${p.tier}</span>` : ""}${feats}</td>
        <td>${priceStr}${annual}</td>
        <td>${prov}</td>
      </tr>`;
    }).join("");
    return `<section class="vendor">
      <div class="vendor-head" style="cursor:default">
        <span class="avatar" style="background:${vendorColor(vendor)}">${initials(vendor)}</span>
        <h3>${PLAN_VENDOR_LABEL[vendor] || vendor}</h3>
        <span class="count">${plans.length} plan${plans.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="table-scroll"><table><thead><tr><th>Plan</th><th>Price <span class="lbl">US list · indicative</span></th><th>Provenance</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
  }).join("");
  byId("plans-wrap").innerHTML =
    cards + (data.disclaimer ? `<p class="lbl" style="margin-top:1rem">${data.disclaimer}</p>` : "");
  enableAnalyticsTab("plans");
}

export function renderSources(data: ProvidersRegistry) {
  if (!data || !Array.isArray(data.providers) || !data.providers.length) return;
  const groups = SOURCE_CAT_ORDER.map((cat) => {
    const ps = data.providers.filter((p) => p.category === cat);
    if (!ps.length) return "";
    const rows = ps.map((p) => {
      const links = [];
      if (p.apiPricingUrl) links.push(`<a href="${p.apiPricingUrl}" target="_blank" rel="noopener">API pricing ↗</a>`);
      if (p.consumerPlansUrl) links.push(`<a href="${p.consumerPlansUrl}" target="_blank" rel="noopener">plans ↗</a>`);
      const inCatalog = p.catalogVendor
        ? `<span title="In the catalog as '${p.catalogVendor}'">✓</span>`
        : '<span class="lbl" title="Not yet in the catalog">—</span>';
      return `<tr>
        <td>${inCatalog}</td>
        <td><strong>${p.name}</strong>${p.note ? `<div class="lbl">${p.note}</div>` : ""}</td>
        <td>${links.join(" · ") || '<span class="lbl">—</span>'}</td>
      </tr>`;
    }).join("");
    return `<section class="vendor">
      <div class="vendor-head" style="cursor:default"><h3>${SOURCE_CAT_LABEL[cat]}</h3><span class="count">${ps.length}</span></div>
      <div class="table-scroll"><table><thead><tr><th>In catalog</th><th>Provider</th><th>Official pricing</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
  }).join("");
  byId("sources-wrap").innerHTML =
    groups + (data.disclaimer ? `<p class="lbl" style="margin-top:1rem">${data.disclaimer}</p>` : "");
  enableAnalyticsTab("sources");
}

export function coverageGapUrl(vendor: string) {
  const p = new URLSearchParams({
    template: "propose-model.yml",
    "change-type": "Correct a field on an existing model",
    vendor,
  });
  return `${ISSUE_NEW}?${p.toString()}`;
}
export function renderCoverage(cov: Coverage) {
  const pct = (r?: number) => Math.round((r || 0) * 100);
  // Data hygiene (T53): hide columns that are 0% across the WHOLE catalog — an
  // all-empty column advertises a field we don't actually carry, which erodes the
  // trust this view exists to build. They return automatically once data arrives.
  const shownFields = cov.fields.filter((f) => (cov.overall.fields[f] || {}).rate > 0);
  const hiddenCount = cov.fields.length - shownFields.length;
  const cell = (vendor: string | null, field: string, o: CoverageBucket) => {
    const c = o.fields[field] || { filled: 0, rate: 0 };
    const bg = `color-mix(in srgb, var(--brand) ${pct(c.rate)}%, transparent)`;
    const gap = c.rate === 0 ? " gap" : "";
    const who = vendor ? vendorLabel(vendor) : "all models";
    const title = `${COV_LABEL[field] || field}: ${pct(c.rate)}% of ${who} (${c.filled}/${o.total})`;
    // A vendor cell that isn't fully covered links to a pre-filled proposal; the
    // overall row and full cells are static.
    if (vendor && c.rate < 1) {
      return `<td><a class="cov-cell${gap}" style="background:${bg}" href="${coverageGapUrl(vendor)}" target="_blank" rel="noopener" title="${title} — propose a fix">${pct(c.rate)}%</a></td>`;
    }
    return `<td><span class="cov-cell${gap}" style="background:${bg}" title="${title}">${pct(c.rate)}%</span></td>`;
  };
  const head = `<tr><th class="cov-vendor">Vendor</th>${shownFields.map((f) => `<th title="${f}">${COV_LABEL[f] || f}</th>`).join("")}</tr>`;
  const rowFor = (vendor: string | null, o: CoverageBucket, cls: string) =>
    `<tr class="${cls}"><th class="cov-vendor">${vendor ? vendorLabel(vendor) : "All vendors"} <span class="lbl">${o.total}</span></th>${shownFields.map((f) => cell(vendor, f, o)).join("")}</tr>`;
  const body = rowFor(null, cov.overall, "cov-overall") +
    Object.entries(cov.byVendor).map(([v, o]) => rowFor(v, o, "")).join("");
  byId("cov-wrap").innerHTML =
    `<table class="cov"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  const legend = document.createElement("p");
  legend.className = "cov-legend";
  legend.innerHTML =
    `<span><span class="sw" style="background:color-mix(in srgb,var(--brand) 92%,transparent)"></span>well covered</span>` +
    `<span><span class="sw" style="background:color-mix(in srgb,var(--brand) 22%,transparent)"></span>sparse</span>` +
    `<span><span class="sw" style="border:1px dashed var(--border-strong)"></span>none — <a href="#contribute">help fill it in</a></span>` +
    (hiddenCount ? `<span class="lbl">${hiddenCount} field${hiddenCount !== 1 ? "s" : ""} hidden (0% across the catalog)</span>` : "");
  byId("cov-wrap").after(legend);
  enableAnalyticsTab("coverage");
}

