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

## §M — Conversational catalog: ask the catalog, get cited answers

The catalog is a structured *reference*, and its highest-value questions are
comparative and numeric — "cheapest embedding model with ≥1M context", "open-weight
chat under $0.50/1M with tools", "which xAI models do vision". Those are precisely
the questions a **vectorless / structured-data RAG** answers well (deterministic
field/facet/range filtering, then an LLM grounded on the matched rows) and a
vector-embedding RAG answers *badly* (numeric thresholds and exact-field predicates
are not what similarity search is for). The catalog is therefore an almost ideal
vectorless-RAG corpus — small (~240 rows), fully structured, provenance-stamped.

**The architectural constraint decides the shape.** The site is **static and
zero-dep** by foundational bet (Node built-ins + inline HTML/CSS/JS; no server, no
runtime query — see the guardrails at the top of this file). An LLM Q&A feature
cannot run *here*: no backend, and an API key must never ship in a static page. So
the RAG/LLM lives on a **separate backend**, and the natural one already exists —
**Viglet Turing ES's grounded catalog copilot** (`POST /api/sn/{site}/copilot`:
NL→filter over a declared field schema → structured DSL search, no embeddings → LLM
answers strictly from cited rows), hosted on `turing-demo.viglet.org`. This repo's
job is only to (a) emit the two artifacts that make the catalog answerable by such a
backend and (b) add an optional widget that renders its **grounded, cited** answers.
Answers cite `id`s that resolve to per-model pages / the drawer — never invented,
consistent with the provenance-first bet. The counterpart backend work is
`openviglet/turing` Block BF (name the vectorless capability + a JSON-feed pull
ingester + a copilot widget/hook).

This serves the **orient** job of §L (a newcomer asks a question instead of learning
the filter UI) and the GEO thesis of STRATEGY §I (a catalog that answers, with
citations, is exactly what an assistant cites). It is *additive*: no schema/envelope
change, new emitted artifacts, and a widget that **hides itself** when no endpoint is
configured — the site stays fully self-contained and framework-free.

### §M1 — T59 · Structured-RAG field manifest
Emit `models/query-manifest.json`: a machine description of the flat record shape
already emitted as `catalog.ndjson` — per field, its name, type
(`STRING`/`NUMBER`/`BOOL`/`ARRAY`), whether it is facetable, the enum value set where
bounded (vendor, kind, capabilities, modalities, tier), the numeric min–max where
ranged (context window, max output, price in/out), the canonical sort keys, and a
short human description. This is the **contract** an external structured/vectorless
RAG declares its field schema from (Turing maps it to `TurSNSiteFieldExt`) and
constrains its NL→filter parser against, so the LLM can only reference real fields —
no guessed or hallucinated columns. Derived-at-emit from the canonical file, zero-dep.

### §M2 — T60 · LLM context bundle (stuff-all + GEO)
Emit `models/context.txt`: a compact, token-budgeted digest — a header describing the
columns + `lastUpdated` + the standing indicative/verify caveats, then one line per
model carrying the decision-relevant fields (id, vendor, kind, context, max output,
price in/out, tier, key capabilities, headline benchmark, open-weights). Sized to fit
a small context window (target ≤ ~40k tokens) so the *entire* catalog can be stuffed
into one prompt — the extreme-vectorless path where, for a corpus this small, you can
skip retrieval altogether. Doubles as an assistant-ingestible GEO artifact
(complements the T26 `llms.txt`): an assistant browsing the site gets the whole
catalog in one fetch. Emitted, not authored, so it can never drift from the source.

### §M3 — T61 · "Ask the catalog" widget
An optional chat box on the SPA's orient surface that POSTs a question to a
configurable structured-RAG endpoint (`data-ask-endpoint`; default the
`turing-demo.viglet.org` catalog copilot) and renders the grounded answer with
**cited model deep-links** — mapping each returned citation `id` back to its per-model
page / the T17 drawer so a claim is one click from its evidence. The key rules that
keep the foundational bets intact: **no API key in the page** (the backend holds
it — the widget only sends the question and renders the response), and the section
**hides entirely** when `data-ask-endpoint` is unset, so a plain checkout of the repo
still builds and serves a fully self-contained static site. Inline JS, zero-dep,
consumes the SDK's existing model→URL helpers for the citation links.
