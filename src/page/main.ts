/* Composition root (T65): theme, floating background, count-up, install tabs, copy
   buttons, the client boot (catalog + analytics), and all top-level event wiring. */
import { byId, qs, qsa, elClosest, toast } from "./dom.js";
import { state, pinned } from "./state.js";
import { debounce } from "./format.js";
import { render, resetAndRender } from "./table.js";
import {
  closeDrawerByUser, closeCompareByUser, syncPinButtons, updateTray,
  togglePin, unpin, openPalette, closePalette, renderPalette, palMove,
  selectEntry, buildPaletteIndex,
} from "./detail.js";
import {
  applyHash, writeCurrentState, clearFilters, buildPresets, syncRailToggle,
} from "./controls.js";
import {
  renderDashboard, renderCoverage, renderPlans, renderSources,
  renderFrontier, renderLeaderboards, selectAnalyticsTab,
} from "./panels.js";
import { ModelCatalogClient } from "../sdk/model-catalog-client.js";
import { initAsk } from "./ask.js";

/* ── Theme toggle ──────────────────────────────── */
/* data-theme is already set (pre-paint) by the classic script in <head>;
   here we only wire the toggle button. */
(function () {
  const KEY = "mc-theme";
  const root = document.documentElement;
  byId("theme").onclick = () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem(KEY, next);
    // Scatter marks bake per-theme fills (near-black lifts on the dark
    // surface), so redraw it when the theme flips (T64).
    if (state.catalog && !byId("decide").hidden) renderFrontier();
  };
})();

/* ── Floating background ───────────────────────── */
(function () {
  const fx = byId("fx");
  const syms = ["∑","∇","λ","{ }","</>","⟨⟩","π","∫","◈","⬡","∂","θ","≈","→","x²","φ","∆","·"];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const s = document.createElement("span");
    s.textContent = syms[i % syms.length];
    const size = 0.9 + (i % 5) * 0.55;
    s.style.fontSize = size + "rem";
    s.style.left = ((i * 37) % 100) + "%";
    s.style.top = ((i * 53) % 100) + "%";
    s.style.animationDuration = (9 + (i % 7) * 2.5) + "s";
    s.style.animationDelay = "-" + (i % 9) + "s";
    fx.appendChild(s);
  }
})();

export function countUp(el: HTMLElement, target: number) {
  if (!isFinite(target)) { el.textContent = String(target); return; }
  const dur = 900, t0 = performance.now();
  (function step(t: number) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

// Load the catalog through the SDK (baseUrl "." → the current directory), then
// pull the aggregate datasets through its typed accessors — the same calls an
// external consumer makes. No raw fetch("./catalog.json") anywhere on the page.
export const client = new ModelCatalogClient({ baseUrl: "." });
client.load()
  .then((data) => {
    state.catalog = data;
    state.byKey = new Map();
    for (const [v, ms] of Object.entries(data.vendors)) for (const m of ms) state.byKey.set(v + "/" + m.id, m);
    buildPaletteIndex();
    buildPresets(); // curated preset links in the facet rail (T56)
    const all = Object.values(data.vendors).flat();
    const kinds = new Set(all.map((m) => m.kind));
    countUp(qs('[data-stat="models"]'), all.length);
    countUp(qs('[data-stat="vendors"]'), Object.keys(data.vendors).length);
    countUp(qs('[data-stat="kinds"]'), kinds.size);
    qs('[data-stat="version"]').textContent = "v" + data.version;
    byId("footmeta").textContent =
      ` · schema v${data.version} · updated ${data.lastUpdated} · ${all.length} models`;
    // Debounce the keystroke re-render (T57): Browse rebuilds the whole table DOM,
    // so coalesce rapid typing into one render ~140ms after the last keystroke.
    const onSearch = debounce(() => { resetAndRender(); writeCurrentState(); }, 140);
    byId("q").addEventListener("input", onSearch);
    window.addEventListener("hashchange", applyHash);
    // Row click → navigate to the model permalink (hashchange opens the drawer).
    // Skip clicks on the permalink anchor (handled separately) and vendor headers.
    byId("list").addEventListener("click", (e) => {
      const pg = elClosest(e, "[data-page]");   // pager button (T67)
      if (pg) { state.page = +(pg.dataset.page ?? "1"); render(); byId("list").scrollIntoView({ block: "start" }); return; }
      if (elClosest(e, ".permalink") || elClosest(e, "[data-pin]") || elClosest(e, ".vendor-head")) return;
      const card = elClosest(e, "[data-key]");   // model card (T68)
      if (card) location.hash = "#" + encodeURI(card.dataset.key ?? "");
    });
    byId("list").addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = elClosest(e, ".mcard[data-key]");
      if (card) { e.preventDefault(); location.hash = "#" + encodeURI(card.dataset.key ?? ""); }
    });
    applyHash(); // build filters + render, honoring any deep-linked state/permalink
    // Aggregate/registry datasets via the SDK's typed accessors (T47), not raw
    // fetch — the page dogfoods stats()/coverage()/plans()/providers() exactly as
    // an external consumer would. Any absent artifact leaves its section hidden.
    client.stats().then((s) => { if (s) renderDashboard(s); }).catch(() => {});
    client.coverage().then((c) => { if (c) renderCoverage(c); }).catch(() => {});
    client.plans().then((p) => { if (p) renderPlans(p); }).catch(() => {});
    client.providers().then((p) => { if (p) renderSources(p); }).catch(() => {});
    // Decide views (T54): the frontier scatter is derived from the loaded catalog;
    // the leaderboards come from the precomputed leaderboards.json via the SDK.
    if (renderFrontier()) byId("decide").hidden = false;
    client.leaderboards().then((l) => { if (renderLeaderboards(l)) byId("decide").hidden = false; }).catch(() => {});
    // A dot or leaderboard row opens the model's drawer via its permalink.
    const toDrawer = (e: Event) => { const el = elClosest(e, "[data-key]"); if (el) location.hash = "#" + encodeURI(el.dataset.key ?? ""); };
    byId("frontier").addEventListener("click", toDrawer);
    byId("leaderboards").addEventListener("click", toDrawer);
  })
  .catch((e) => {
    byId("status").innerHTML =
      "Could not load the catalog (" + e.message + "). Run <code>npm run emit</code> locally, or wait for the published site.";
  });

/* ── Install tabs (per build tool) ─────────────── */
qsa(".tabbed").forEach((box) => {
  const tabs = qsa(".tab", box);
  const panels = qsa(".panel", box);
  tabs.forEach((tab, i) => {
    tab.onclick = () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      panels[i].classList.add("active");
    };
  });
});

/* ── Copy buttons ──────────────────────────────── */
document.addEventListener("click", (e) => {
  const btn = elClosest(e, "[data-copy]");
  if (!btn) return;
  const code = btn.parentElement!.querySelector("code") as HTMLElement;
  navigator.clipboard.writeText(code.innerText).then(() => {
    const old = btn.textContent;
    btn.textContent = "Copied ✓";
    setTimeout(() => (btn.textContent = old), 1400);
  });
});

// A permalink click both navigates (→ hashchange → open drawer) and copies the citable URL.
document.addEventListener("click", (e) => {
  const pl = elClosest(e, ".permalink");
  if (!pl) return;
  const url = location.origin + location.pathname + location.search + pl.getAttribute("href");
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Permalink copied ✓")).catch(() => {});
});

/* ── Drawer close + copy actions (T17) ─────────── */
byId("drawer-close").onclick = closeDrawerByUser;
byId("dbackdrop").onclick = closeDrawerByUser;
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closePalette(); closeCompareByUser(); closeDrawerByUser();
});
document.addEventListener("click", (e) => {
  if (state.drawerModel && elClosest(e, "[data-copy-id]")) {
    navigator.clipboard && navigator.clipboard.writeText(state.drawerModel.id).then(() => toast("Model id copied ✓"));
  } else if (state.drawerModel && elClosest(e, "[data-copy-json]")) {
    navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(state.drawerModel, null, 2)).then(() => toast("Model JSON copied ✓"));
  } else if (state.drawerModel && elClosest(e, "[data-pin-drawer]")) {
    const key = state.drawerModel.vendor + "/" + state.drawerModel.id;
    togglePin(key);
    const b = elClosest(e, "[data-pin-drawer]")!;
    const on = pinned.has(key);
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "✓ Comparing" : "⇄ Compare";
  }
});

/* ── Compare wiring (T18) ──────────────────────── */
byId("cmp-close").onclick = closeCompareByUser;
byId("cbackdrop").onclick = closeCompareByUser;
byId("tray-clear").onclick = () => { pinned.clear(); syncPinButtons(); updateTray(); closeCompareByUser(); };
byId("tray-go").onclick = () => {
  if (pinned.size >= 2) location.hash = "#compare=" + [...pinned].map(encodeURIComponent).join(",");
};
// Pin / unpin via delegation (row buttons + tray/modal ✕ chips).
document.addEventListener("click", (e) => {
  const pinBtn = elClosest(e, "[data-pin]");
  if (pinBtn) { const card = pinBtn.closest("[data-key]"); if (card) togglePin((card as HTMLElement).dataset.key ?? ""); return; }
  const un = elClosest(e, "[data-unpin]");
  if (un) unpin(un.getAttribute("data-unpin") ?? "");
});

/* ── Analytics tab wiring (T55) ────────────────── */
byId("atabs").addEventListener("click", (e) => {
  const t = elClosest(e, ".atab");
  if (t) selectAnalyticsTab(t.dataset.atab ?? "");
});

/* ── Compact mobile menu (T57) ─────────────────── */
(function () {
  const btn = byId("navtoggle");
  const menu = byId("navmenu");
  btn.onclick = () => {
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  // A menu link navigates (hash change) — close the menu after the pick.
  menu.addEventListener("click", (e) => {
    if (elClosest(e, "a")) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  });
})();

/* ── Rail collapse toggle (T67) ────────────────── */
/* The filters rail is COLLAPSED BY DEFAULT (T68) so the card grid gets the full
   width; it opens on demand. The choice persists in localStorage (a view pref,
   not filter state, so it stays out of the shareable URL) — only an explicit
   "0" (the user expanded it) keeps it open on the next visit. */
(function () {
  const KEY = "mc-rail";
  if (localStorage.getItem(KEY) !== "0") byId("browse-layout").classList.add("rail-collapsed");
  syncRailToggle();
  byId("rail-toggle").onclick = () => {
    const collapsed = byId("browse-layout").classList.toggle("rail-collapsed");
    localStorage.setItem(KEY, collapsed ? "1" : "0");
    syncRailToggle();
  };
})();

/* ── Facet rail: clear-all + copy-link (T56) ───── */
byId("clear-filters").onclick = clearFilters;
byId("copy-view").onclick = () => {
  if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(() => toast("Link to this view copied ✓")).catch(() => {});
};

/* ── Ask the catalog (T61) ─────────────────────── */
// Reveals + wires itself only when #ask[data-ask-endpoint] is set; otherwise a no-op
// and the section stays hidden (self-contained). Runs independent of catalog load —
// by the time a user asks, state.byKey is populated so citations deep-link.
initAsk();

/* ── Palette wiring (T19) ──────────────────────── */
byId("palbtn").onclick = openPalette;
byId("pbackdrop").onclick = closePalette;
byId("pal-q").addEventListener("input", renderPalette);
byId("pal-q").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); palMove(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); palMove(-1); }
  else if (e.key === "Enter") { e.preventDefault(); const en = state.palResults[state.palActive]; if (en) selectEntry(en); }
});
byId("pal-results").addEventListener("click", (e) => {
  const li = elClosest(e, ".pal-item"); if (!li) return;
  const en = state.palResults[+(li.dataset.i ?? "0")]; if (en) selectEntry(en);
});
// ⌘K / Ctrl-K opens the palette from anywhere.
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
});
