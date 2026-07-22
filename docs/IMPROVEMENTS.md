# Model Catalog — Design rationale (IMPROVEMENTS)

> The *what/why* for **unshipped** sections only. No status tables, no shipped
> implementation reports (those live in `git log` + [CHANGELOG.md](CHANGELOG.md)).
> Status lives only in [ROADMAP.md](ROADMAP.md).

> **Guardrails these all respect.** **Zero npm dependency** (Node built-ins + inline
> HTML/CSS/JS only), no runtime / server-side query, propose-and-review only, and no
> envelope-shape break (`version` stays `1` — new fields optional and additive). Pricing
> is now in scope but **bounded** to an *indicative US list price* (STRATEGY §I, reversed
> by Block F). Consumer artifacts stay *derived* from the canonical file at emit time, so
> they can never drift from the source of truth.

## §G — Static-site expansion & citability

The catalog's **cite/reference** job is served by static, crawlable, JS-free pages emitted
from the canonical JSON — the durable counterpart to the interactive Explore SPA (§L). The
scalable path is to **extend the zero-dep `emit.mjs` generator**, not adopt a framework:
Next.js was weighed and rejected because it would break the foundational zero-dependency
bet to solve a problem the emit path already solves (generating static files from a JSON is
a loop, not a framework need). The seam with §L is deliberate and load-bearing: the SPA owns
*interactivity* (filter / sort / compare over the live dataset); these pages own *citability*
(one model, one segment — linkable, indexable, provenance-first). The drawer is the bridge —
a preview that always links out to the durable per-model page.

### §G1 — T34 · Per-segment hubs + sitemap
Reframed from "more landing pages" into real **per-segment hubs**: per-capability /
per-modality / per-kind (and per-tier) pages that are each a compact **static leaderboard**
(the top models in that segment, pre-sorted, cross-linked to per-model pages) + a short prose
intro + links to the matching JSON slice and to Explore pre-filtered to that segment — *not*
a bare link list. Plus `sitemap.xml` + `robots.txt` so every hub and per-model page is
crawlable. Serves humans and assistants/crawlers at once; derived-at-emit, zero-dep, no
framework. (This is the "reference/cite" backbone of the §L information architecture, no
longer an SEO side-quest.)

### §G2 — T58 · First-class per-model page
Today a model's depth lives only in the transient SPA drawer and a minimal, differently-styled
emitted table — there is no durable, well-laid-out, citable page, which is the thing a reference
site most needs. Promote the emitted page to a first-class, scannable reference: a header
(vendor / kind / use-case tags / tier / open-weights), an **at-a-glance stat strip** (context,
max output, price, one headline benchmark, throughput — only tiles that carry data),
populated-only sections (pricing / benchmarks incl. per-domain scores / performance / identity /
capabilities, each with its cited caveat + `source` + `lastVerified`), an **always-visible
provenance block** (the trust anchor on a citable page), and derived **related models** (same
vendor + kind neighbours, tier above/below — a loop at emit, zero-dep). Style it with the SPA's
design **tokens** so hub → page → drawer read as one system (today the static page is a jarring
separate mini-stylesheet). Sparse-aware by *omitting* empty sections (a low-data model looks
intentional, not broken) — unlike the drawer/compare, which show "—" for alignment. The drawer
stays as the in-context preview and gains an "Open full page ↗" link. Evolves T26.
