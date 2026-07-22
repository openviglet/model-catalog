# Model Catalog — Strategy & positioning

> Business/positioning decisions (markets, deprecations, bets). Not a backlog —
> numbered work lives in [ROADMAP.md](ROADMAP.md).

## §I A vendor-neutral market reference — identity, kind, and US list pricing

**The bet.** There is no good open, browsable, *identity-and-kind-first* reference
for "which models exist, of what kind, with what context window and capabilities."
LiteLLM's `model_prices_and_context_window.json` is the de-facto registry but it is
pricing-first and not designed to be browsed. Publishing a free, unauthenticated,
CORS-open, versioned catalog keyed by vendor + kind fills that gap and doubles as a
discoverability/authority asset for **Viglet Turing ES** (the GEO thesis: be the
thing tools and assistants cite when asked "what embedding models does OpenAI
have?").

**Pricing — reversed 2026-07-22.** This catalog originally carried *no* cost or
price: the regeneration pipeline stripped every `*cost*`/`*price*` key, on the
reasoning that pricing changes constantly, varies by contract/region, and is already
tracked by LiteLLM. That stance is **reversed**. The driver is concrete: **Viglet
Turing ES needs per-token cost to generate consumption/spend reports**, and having
every consumer separately join this catalog to a second pricing source is more
fragile than publishing the number once, with provenance, next to the identity it
belongs to. The catalog now carries an **optional per-token US list price** per model,
sourced + `lastVerified` like every other regenerated field. Bounds we accept to keep
the maintenance and legal surface contained:

- **US list price only** — not per-contract, per-region, negotiated or committed-use
  pricing. One public reference number, not a billing engine.
- **Optional + best-effort** — a model with no trusted price omits it (the
  missing-field-beats-wrong rule still holds); a price is never invented.
- **Provenance-gated** — a price publishes only with a `source` + `lastVerified`, and
  only ever through propose-and-review, exactly like identity fields.

LiteLLM stays the upstream we enrich from — we now *keep* its price keys (mapped into
our shape and normalized to per-token USD) instead of stripping them. Implementation
is tracked as **Block F** in [ROADMAP.md](ROADMAP.md).

**Consumer subscription plans — in scope, as a separate dataset (decided 2026-07-22).**
Beyond per-model API pricing, vendors sell consumer tiers (Claude Pro/Max, ChatGPT
Plus/Pro, Gemini / Google AI Pro/Ultra). The open question was whether a *model-identity*
catalog should own these at all. Decision: yes, but they are **not models** — they ship as
a **separate `plans.json` dataset** (own schema, own envelope), never inside `ModelEntry`.
Same bounds as per-model pricing: **US list only, indicative-not-authoritative, sourced +
`lastVerified`, never invented**. Hand-curated + review-gated (no upstream API exists for
consumer plans). Keeping plans out of the model catalog preserves the "identity + kind"
core while still giving Turing one place to read a plan reference.

**Trust model.** The value of a reference is trust, so provenance is first-class
(`sources`/`lastVerified` per entry) and the canonical file is only ever updated via
propose-and-review — a bad upstream fetch must never silently poison the reference.

**Relationship to Viglet Turing ES.** Turing consumes this catalog as its
model-picker reference (remote fetch, offline-tolerant) but does not own it. Keeping
the catalog in its own repo lets it version, publish and evolve independently of the
product release cycle, and lets other tools depend on it without depending on Turing.

## §II A reference that answers — the conversational layer (decided 2026-07-22)

**The bet.** A market reference is more valuable, and more citable, when you can
*ask* it — "cheapest embedding model with ≥1M context", "open-weight chat under
$0.50/1M with tools" — instead of only browsing filters. These are comparative,
numeric, exact-field questions: the sweet spot of **vectorless / structured-data
RAG** (deterministic field/facet/range filtering, then an LLM grounded on the matched
rows) and the weak spot of vector-embedding RAG. Because the catalog is small,
fully structured and provenance-stamped, it is close to an ideal vectorless-RAG
corpus, and a Q&A surface directly advances the GEO thesis in §I (an assistant cites
the source that answers, with citations, not the one that only lists).

**Where the compute lives — deliberately not here.** The site is static and zero-dep
by foundational bet, and an API key must never ship in a static page, so the RAG/LLM
runs on a **separate backend**, not in this repo. The chosen backend is **Viglet
Turing ES's grounded catalog copilot** (`/api/sn/{site}/copilot` — vectorless, cited)
on `turing-demo.viglet.org`; any OpenAI-compatible endpoint could stand in. This repo
contributes only *derived artifacts* (a field manifest + a stuffable context bundle)
and an *optional* widget that renders grounded, cited answers and hides itself when no
endpoint is configured — so the reference stays self-contained and framework-free
while gaining a conversational front door. Answers cite `id`s that resolve to
per-model pages; nothing is invented (the provenance-first rule holds end to end).
Tracked as **Block M** in [ROADMAP.md](ROADMAP.md); the backend counterpart is
`openviglet/turing` Block BF.
