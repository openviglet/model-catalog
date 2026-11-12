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

### §T98 Refresh the copilot after each deploy

The catalog copilot on turing-demo.viglet.org reads this repo's `catalog.ndjson` through
Turing's structured-feed pull ingester, which only re-reads the feed on an hourly timer.
On 2026-11-05 Pages served the new catalog at 14:59 UTC while the `model-catalog` SN
site still answered with the 2026-10-30 rows, so every release reaches the copilot up to
an hour late, and nothing in `publish.yml` can shorten that.

Waits on Turing's on-demand structured-feed ingest (its roadmap line 1227, block CO: an
authenticated endpoint that pulls one feed now). Once it ships, add a final step to
`.github/workflows/publish.yml`, after `deploy-pages`, that calls it for the
`model-catalog` source with a key held as a repository secret, and fails soft: a Turing
outage must never fail the Pages deploy. Then verify one changed field through
`/api/sn/model-catalog/search` in the step's log.

## Block U — What the README promises is what a visitor gets

### §T93 The SDKs are on npm, PyPI and Maven Central

**Where it showed.** The README's Client SDKs table says all three clients are
"published to their public registries" and gives `npm i
@openviglet/model-catalog-client`, `pip install openviglet-model-catalog-client` and the
Maven coordinates `io.github.openviglet:model-catalog-client:1.0.2`. On 2026-10-30 npm
and PyPI answer 404 for those names and Maven Central finds none. The manual publish
workflows exist (`publish-js-client.yml`, `publish-python-client.yml`,
`publish-java-client.yml`) and have never run; the working paths are the JitPack build,
GitHub-release tarball and `git+` installs.

**Why it costs.** The first command a developer copies fails. The owner decided on
2026-10-30 that the SDKs are published for real on npm, PyPI and Maven Central, so
others can use the product (visibility repo, produtos/model-catalog.md).

**Design.** The owner sets up what only an account can: the `@openviglet` npm scope or a
decision to use `@viglet` like Turing's SDKs, a PyPI project token, the
`io.github.openviglet` namespace verified on the Central Portal, and the workflow
secrets each file's header names. Then one run of each workflow, and the README table
states the version each registry holds. Until a registry has the package, its row shows
the working fallback instead of the registry command.

### §T95 A README that works as the landing page

**Where it showed.** The README opens with a dense paragraph, then a URL table and a
`jq` one-liner, then SDK install rows, then maintenance. Nothing says in one line who it
is for, no snippet shows a use in three lines of code, and models.dev, the closest open
alternative and one of the pipeline's own sources, is not mentioned.

**Why it costs.** The portfolio review of 2026-10-30 names the model-catalog as the best
Viglet candidate for a Show HN, once the SDKs are really on the registries (visibility
repo, estrategia/portfolio.md and produtos/model-catalog.md). On HN the README is the
landing page, and "why not models.dev?" is the predictable first comment.

**Design.** The opening becomes one sentence on what it is and for whom, then a
three-line example (install, load, filter: every embedding model with its dimensions),
then a short "How it differs" paragraph: kinds beyond chat (embedding, rerank, media),
provenance per field, and the sources it merges, models.dev and LiteLLM among them. The
current detail moves below. The launch post itself is drafted in the visibility repo,
not here.

## Block B — Client libraries / SDKs

### §T101 The Java client follows redirects, released as 1.0.6

**What broke.** T99 moved the catalog to models.viglet.org on 2026-11-05, and
openviglet.github.io/model-catalog now answers `301`. The Java client's default
transport (`HttpFetcher` in `ModelCatalogClient`) builds `HttpClient.newHttpClient()`,
whose redirect policy is `NEVER`, and throws on any non-2xx. So every consumer of 1.0.5,
whose `DEFAULT_BASE_URL` is still the old address, gets an `IOException` instead of the
catalog. Turing is one: its released builds lost the model picker's catalog (filed in
Turing's roadmap, Block CQ). The JS client (`fetch`) and the Python client (`urllib`)
follow redirects by default and are not affected.

**What to do.**
1. Build the client with `followRedirects(HttpClient.Redirect.NORMAL)`, so the next move of the endpoint does not break consumers again. `NORMAL` refuses an https-to-http downgrade, which is right now that models.viglet.org enforces HTTPS.
2. Release the Java client as 1.0.6 to Maven Central, carrying this and the new `DEFAULT_BASE_URL` from T99, which no release has yet.
3. A test with a fetcher stub, or a local server, that answers `301` and then the catalog.

**Done when** 1.0.6 is on Maven Central, it reads the catalog through the old
openviglet.github.io address, and Turing can bump to it.

## Block V — What a consumer indexes: the feed artifacts carry every model once
