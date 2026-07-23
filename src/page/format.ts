/* Vendor visual identity, mark primitives, and pure value formatters (T65).
   No DOM access, no shared state — safe to import anywhere. */
import type { ModelEntry, Pricing, Benchmarks, BenchmarkScore, Performance } from "./types.js";
import {
  VENDOR_LABEL, VENDOR_STYLE, VENDOR_FALLBACK, ISSUE_NEW,
  TIER_BG, TIER_HINT, PRICE_CAVEAT, TIER_ORDER,
} from "./constants.js";

export const vendorLabel = (v: string) => VENDOR_LABEL[v] || v;
export const vendorColor = (v: string) => (VENDOR_STYLE[v] || VENDOR_FALLBACK).c;
export const vendorShape = (v: string) => (VENDOR_STYLE[v] || VENDOR_FALLBACK).s;
export const initials = (v: string) => (VENDOR_LABEL[v] || v).replace(/[^A-Za-z ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/* ── Metric icons (T68) ──────────────────────────────────────
   Inline SVG, zero-dep on purpose — no icon font / CDN / npm package (the page
   stays self-contained per the repo's no-runtime-dependency rule). 24px
   Feather/Lucide-style stroke paths drawn at currentColor, so CSS owns size and
   colour. Used label-less on the model card: an icon + the raw value. */
const ICON_PATHS: Record<string, string> = {
  context: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  output: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  dims: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  price: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  intelligence: '<circle cx="12" cy="8" r="6"/><path d="M15.5 12.9 17 22l-5-3-5 3 1.5-9.1"/>',
  speed: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  params: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};
export const icon = (name: string) =>
  `<svg class="mic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;

/* ── Vendor marks: one shape primitive, reused by the scatter and the inline
   glyphs (T64). shapeEl draws a shape centred at (cx,cy) sized so all four read
   at a similar visual weight; vendorGlyph wraps one in a tiny standalone SVG. */
export const _n = (x: number) => x.toFixed(1);
export function shapeEl(shape: string, cx: number, cy: number, r: number, attrs = "", inner = "") {
  let tag, geom;
  if (shape === "square") { const s = r * 0.9; tag = "rect"; geom = `x="${_n(cx - s)}" y="${_n(cy - s)}" width="${_n(2 * s)}" height="${_n(2 * s)}" rx="1"`; }
  else if (shape === "diamond") { const d = r * 1.28; tag = "polygon"; geom = `points="${_n(cx)},${_n(cy - d)} ${_n(cx + d)},${_n(cy)} ${_n(cx)},${_n(cy + d)} ${_n(cx - d)},${_n(cy)}"`; }
  else if (shape === "triangle") { const R = r * 1.45, dx = 0.866 * R; tag = "polygon"; geom = `points="${_n(cx)},${_n(cy - R)} ${_n(cx + dx)},${_n(cy + R / 2)} ${_n(cx - dx)},${_n(cy + R / 2)}"`; }
  else { tag = "circle"; geom = `cx="${_n(cx)}" cy="${_n(cy)}" r="${_n(r)}"`; }
  return inner ? `<${tag} ${geom} ${attrs}>${inner}</${tag}>` : `<${tag} ${geom} ${attrs}/>`;
}
export function vendorGlyph(v: string, px = 12) {
  const st = VENDOR_STYLE[v] || VENDOR_FALLBACK;
  return `<svg class="vglyph" width="${px}" height="${px}" viewBox="${-px / 2} ${-px / 2} ${px} ${px}" aria-hidden="true">`
    + shapeEl(st.s, 0, 0, px * 0.4, `fill="${st.c}" stroke="var(--mark-edge)" stroke-width="1"`) + `</svg>`;
}
// Relative luminance + sRGB mix, used to keep a mark visible against the chart
// surface: lift near-black fills on the dark surface, darken near-white on light.
export function _relLum(hex: string) { const [r, g, b] = [0, 2, 4].map((i) => { const c = parseInt(hex.slice(1 + i, 3 + i), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function _mix(hex: string, to: string, a: number) { const p = (i: number) => parseInt(hex.slice(1 + i, 3 + i), 16), q = (i: number) => parseInt(to.slice(1 + i, 3 + i), 16); return "#" + [0, 2, 4].map((i) => Math.round(p(i) * (1 - a) + q(i) * a).toString(16).padStart(2, "0")).join(""); }
export function markFill(hex: string, dark: boolean) {
  const L = _relLum(hex);
  if (dark) return L >= 0.16 ? hex : _mix(hex, "#e6e6e6", Math.min(0.62, (0.16 - L) / 0.16 * 0.72));
  return L <= 0.62 ? hex : _mix(hex, "#1a1a1a", Math.min(0.4, (L - 0.62) / 0.38 * 0.5));
}
export function fmtTokens(n?: number | null) {
  if (!n) return "";
  if (n >= 1_000_000) { const m = n / 1_048_576; return (m >= 10 ? Math.round(m) : m.toFixed(m % 1 === 0 ? 0 : 1)) + "M"; }
  if (n >= 10_000) return Math.round(n / 1000) + "K";
  return n.toLocaleString("en-US");
}
// Coalesce rapid calls into one, `ms` after the last (T57).
export function debounce(fn: (...args: any[]) => void, ms: number) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: any[]) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const tierRank = (t: string | null) => { const i = t ? TIER_ORDER.indexOf(t) : -1; return i < 0 ? 0 : TIER_ORDER.length - i; };
export function correctionUrl(m: ModelEntry) {
  const p = new URLSearchParams({
    template: "propose-model.yml",
    "change-type": "Correct a field on an existing model",
    vendor: m.vendor,
    "model-id": m.id,
  });
  return `${ISSUE_NEW}?${p.toString()}`;
}
export function fmtParams(n?: number | null) {
  if (n == null) return "";
  if (n >= 1e9) return `${n % 1e9 === 0 ? n / 1e9 : (n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${n % 1e6 === 0 ? n / 1e6 : (n / 1e6).toFixed(1)}M`;
  return n.toLocaleString("en-US");
}
export function weightsLabel(m: ModelEntry) {
  if (m.openWeights == null) return "";
  return m.openWeights ? "Open-weight" : "Proprietary (API-only)";
}
export function tierBadge(tier: string | null) {
  return tier ? `<span class="chip" style="background:${TIER_BG[tier]};color:#fff;border-color:transparent" title="${TIER_HINT}">${tier}</span>` : "";
}
export function useCaseChips(tags: string[]) {
  return tags.map((t) => `<span class="chip">${t}</span>`).join("");
}

export const numChip = (s: string | number) => `<span class="chip num">${s}</span>`;
export function priceMoney(v: number) {
  return "$" + Number(v.toFixed(6)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}
export function priceParts(p: Pricing | undefined) {
  const bits = [];
  if (p && p.inputPer1M != null) bits.push([priceMoney(p.inputPer1M), "in"]);
  if (p && p.outputPer1M != null) bits.push([priceMoney(p.outputPer1M), "out"]);
  return bits;
}
// Compact chip for the model list — "$3 · $15 /1M".
export function priceChip(p: Pricing | undefined) {
  const bits = priceParts(p);
  if (!bits.length) return "";
  return `<span class="chip num" title="${PRICE_CAVEAT}">${bits.map(([v]) => v).join(" · ")}/1M</span>`;
}
// Fuller cell for the drawer / comparison, with the indicative caveat inline.
export function priceCell(p: Pricing) {
  const bits = priceParts(p);
  if (!bits.length) return "";
  const figs = bits.map(([v, side]) => `<span class="mono">${v}</span> <span class="lbl">${side}</span>`).join(" · ");
  const meta = [p.source ? `source: ${p.source}` : "", p.lastVerified ? p.lastVerified : ""].filter(Boolean).join(" · ");
  return `${figs} <span class="lbl">/ 1M tokens</span>
    <div class="lbl" style="margin-top:.25rem">Indicative US list — verify with vendor${meta ? ` · ${meta}` : ""}</div>`;
}
export function benchmarkParts(b: Benchmarks | undefined) {
  const bits = [];
  if (b && b.intelligenceIndex != null) bits.push([b.intelligenceIndex, "Intelligence index"]);
  if (b && b.arenaElo != null) bits.push([b.arenaElo, "Arena Elo"]);
  // Per-domain cited scores (T42) — reasoning / coding / math, honest per use-case.
  for (const [domain, s] of Object.entries<BenchmarkScore>((b && b.scores) || {})) {
    if (s && s.value != null) bits.push([s.value, domain.charAt(0).toUpperCase() + domain.slice(1)]);
  }
  return bits;
}
export function benchmarkCell(b: Benchmarks) {
  const bits = benchmarkParts(b);
  if (!bits.length) return "";
  const figs = bits.map(([v, lbl]) => `<span class="mono">${v}</span> <span class="lbl">${lbl}</span>`).join(" · ");
  const meta = [b.source ? `source: ${b.source}` : "", b.lastVerified ? b.lastVerified : ""].filter(Boolean).join(" · ");
  return `${figs}
    <div class="lbl" style="margin-top:.25rem">Cited — verify at the source${meta ? ` · ${meta}` : ""}</div>`;
}

export function performanceParts(p: Performance | undefined) {
  const bits = [];
  if (p && p.throughputTps != null) bits.push([p.throughputTps + " tok/s", "throughput"]);
  if (p && p.latencyTtftSec != null) bits.push([p.latencyTtftSec + "s", "to first token"]);
  return bits;
}
export function performanceCell(p: Performance) {
  const bits = performanceParts(p);
  if (!bits.length) return "";
  const figs = bits.map(([v, lbl]) => `<span class="mono">${v}</span> <span class="lbl">${lbl}</span>`).join(" · ");
  const meta = [p.source ? `source: ${p.source}` : "", p.lastVerified ? p.lastVerified : ""].filter(Boolean).join(" · ");
  return `${figs}
    <div class="lbl" style="margin-top:.25rem">Cited — verify at the source${meta ? ` · ${meta}` : ""}</div>`;
}
// Derived cost-efficiency: cited intelligence index per $ of input list price
// (per 1M tokens). Higher = more capability per dollar. Derived from facts
// already shown, never a stored/invented number — omitted unless both exist.
export function costPerCapability(m: ModelEntry) {
  const idx = m.benchmarks && m.benchmarks.intelligenceIndex;
  const inp = m.pricing && m.pricing.inputPer1M;
  if (idx == null || inp == null || inp <= 0) return "";
  const v = idx / inp;
  return `<span class="mono">${v >= 100 ? Math.round(v) : v.toFixed(1)}</span> <span class="lbl">index pts per $/1M input (derived)</span>`;
}
