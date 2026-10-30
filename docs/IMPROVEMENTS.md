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

## Block T — Source coverage: first-party creators, media & fresh metadata

Gap analysis of 2026-10-30, comparing the catalog with the LiteLLM snapshot and
models.dev. LiteLLM knows ~4,500 ids; the anchoring rule (LiteLLM enriches, never
introduces) correctly keeps ~2,000 of them out, but it also means a creator with no
adapter of its own only appears through gateways. The `vendor` a consumer picks is
the API they will call (Turing's model picker), so a creator reachable only as
`openrouter/x-ai/grok-4.7` is a real gap, not a duplicate.

| Creator | Catalog | Known upstream | Why |
|---|---|---|---|
| xAI | 4 | 61 (LiteLLM), 13 (models.dev) | no adapter |
| Mistral | 5 | 79 / 36 | adapter exists, no `MISTRAL_API_KEY` |
| Qwen / Alibaba | 5 | 63 (DashScope) / 53 | no adapter |
| DeepSeek | 2 | 4 | no adapter |
| Voyage | 7 | 31 | no adapter |
| Moonshot, Perplexity, StepFun | 0 (gateway only) | 6 / 4 / 7 | no vendor |

Recent releases absent from the catalog (tracker dates, not vendor-confirmed): Grok
Voice 3.0, Amazon Nova 2.5 Sonic, Claude Duet (research preview), GPT-6 Pro, Qwen
Image 2.1 Pro, Kimi K2.8 Preview.

### §T86 Live xAI and DeepSeek adapters

xAI and DeepSeek expose OpenAI-compatible `/v1/models` behind a key. A live
adapter gives current ids and the removal evidence models.dev cannot.

### §T87 Source-key coverage report

Today five adapters (Mistral, Cohere, Ollama, Bedrock, HuggingFace) skip
for lack of a key, and the only trace is a WARN line. The regen summary should list
which vendors ran without live evidence, so a maintainer knows the run carried them
forward; `pipeline.md` gets the env-var → source table (and `update-data.cmd`
echoes it).

### §T88 ElevenLabs adapter

VIDEO has 2 entries and IMAGE 10. ElevenLabs lists its models via API and
its key is already provisioned — the cheapest first media adapter.

### §T89 Image and video generation sources

Image and
video generation (Stability, Ideogram, fal.ai, ByteDance Seedance, Alibaba Wan) are
known to LiteLLM (fal.ai alone 210 ids) but blocked by anchoring. Decide per source
whether it anchors (a creator's own API) or only enriches (fal.ai is a host, like
OpenRouter); depends on T82 so media ids are not wrongly removed, and on T85's
creator-anchor rule.

### §T90 Legacy ledger entries outside the grammar

The roadkeep adoption (a58016d) rewrote Block T in roadkeep's grammar but left the 79
pre-adoption CHANGELOG bullets in their old shape: no status marker, no symptom field.
At HEAD `lint` reported this as one `grammar.unreadable`; once the first
roadkeep-written entry (T82) landed, the same debt reads as 79 `line.unparsed`, and
`lint --baseline HEAD` does not forgive it because the code changed. So `lint` can no
longer be a clean gate here, and `show` and `delivered` cannot reach any pre-adoption
task by id.

Two ways out: rewrite each legacy bullet into the ledger grammar (shipped marker,
symptom, why) through a roadkeep migration verb, keeping ids and dates from git; or
declare a legacy section the grammar skips. The first keeps every id queryable and is
preferred. Hand-editing the file is not an option: it is governed.

### §T91 Changed counts only moved fields

`diffReport` in `pipeline/lib/validate.mjs` bumps `stats.changed` and prints a `~ CHANGE
<id>` header for any entry that has merge conflicts, even when no compared field moved.
A standing conflict (LiteLLM disagreeing with a vendor API on `contextWindow`, say) is
re-reported on every run, so an offline re-run over a catalog it just produced reads
`changed: 204` while the proposed envelope is identical to the committed one. A reviewer
cannot tell a no-op run from a real one by the header.

Count an entry as changed only when a compared field differs. Keep the conflicts visible
under their own heading and counter (`conflicts` already exists), so the header line
reads `changed: 0  conflicts: 254` for a no-op run.
