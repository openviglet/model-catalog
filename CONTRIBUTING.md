# Contributing to the Model Catalog

Thanks for helping keep this reference accurate. It is a **community-owned**
catalog — an unbranded, public resource — and it gets better the more people
correct and extend it.

There are two ways to help, and the first needs no code:

## 1. Propose or correct a model (no code required)

Open a structured issue — the fastest path:

**→ [Propose or correct a model](https://github.com/openviglet/model-catalog/issues/new?template=propose-model.yml)**

The form asks for the vendor, model id, kind, and whatever facts you're sure of
(context window, modalities, capabilities…) plus a **source** to back them. A
maintainer verifies it and turns it into a catalog entry (see below). Every field
on the browsable page and in the model detail drawer also has a **"Propose / correct
a model"** link that pre-fills the form with that model's vendor and id.

A few rules that keep the catalog trustworthy:

- **Identity + kind + capability only — never pricing.** Cost/price is deliberately
  out of scope ([STRATEGY.md](docs/STRATEGY.md) §I); the pipeline strips every
  `*cost*`/`*price*` key. Proposals with pricing get the pricing dropped.
- **A missing field beats a wrong one.** Leave a field blank rather than guessing —
  wrong metadata poisons a reference. Cite a source for anything non-obvious.
- **Vendor key is lower-case** (`openai`, `anthropic`, `gemini`, `mistral`, …), and
  the model id must be exactly what the provider's API returns.

## 2. Open a pull request

If you'd rather make the change directly, the mechanism is the curated pin file the
pipeline reads. **The canonical catalog is never edited by hand for regenerated
vendors** — you pin the correct fact and let the pipeline fold it in.

### The propose-and-review path

```
overrides.json  →  npm run regen -- --apply  →  npm run emit  →  PR
   (your pin)         (fold into canonical)      (rebuild public)   (review gate)
```

1. **Add your fact to [`pipeline/overrides.json`](pipeline/overrides.json)**, keyed
   by lower-case vendor. Each entry must carry `id`; add only the fields you're
   correcting. Add `"__pin": true` to force a field to win over every automated
   source — use it only for facts you have personally verified.

   ```jsonc
   {
     "openai": [
       { "id": "gpt-4o-mini", "kind": "CHAT", "contextWindow": 128000, "__pin": true }
     ]
   }
   ```

   `overrides.json` is also an **anchoring** source: a pinned id is admitted even
   when no live vendor API vouches for it (that's how a brand-new vendor row is
   seeded). LiteLLM, by contrast, can only enrich an id that already exists.

2. **Regenerate and review.** A plain run is read-only — it fetches, merges,
   validates and writes a *proposed* envelope + diff report to `pipeline/out/`,
   touching nothing:

   ```bash
   npm run regen                 # dry-run — read the diff report
   npm run regen -- --offline    # replay cached snapshots, no network / no keys
   ```

   Read `pipeline/out/diff-report.txt` and confirm the ADD/REMOVE/CHANGE lines and
   any `⚠ conflict` are what you intended.

3. **Apply, then emit.** `--apply` is the *only* command that writes the canonical
   file; `emit` rebuilds the public artifacts from it:

   ```bash
   npm run regen -- --apply
   npm run emit
   npm test
   ```

4. **Open the PR** with `catalog/model-catalog.json` and your `overrides.json`
   change (the emitted `public/models/*` artifacts are gitignored — CI re-emits
   them on publish). Summarize what changed and link your source.

> **Why the review gate?** The published catalog is an authority asset — a bad
> upstream fetch or an unverified edit must never silently publish. Regeneration is
> always propose-and-review: `--apply` is a deliberate local step, and CI may open a
> PR but never auto-merges. Full maintainer workflow →
> [docs/references/pipeline.md](docs/references/pipeline.md); the data contract →
> [docs/references/api.md](docs/references/api.md).

### Small hand fixes

For a one-off typo on a hand-entered field, editing `catalog/model-catalog.json`
directly and running `npm run emit` is fine — just keep it schema-valid
(`catalog/model-catalog.schema.json`) and re-run `npm test`.

## Ground rules for any change

- **Zero dependencies.** Node built-ins + global `fetch` only; inline HTML/CSS/JS in
  the page. Nothing to `npm install`. Node ≥ 20.
- **Additive schema, `version: 1`.** New `ModelEntry` fields are optional; consumers
  ignore unknowns. A breaking shape change is a separate, deliberate version bump.
- **Provenance is first-class.** Regenerated entries carry `sources` + `lastVerified`.

By contributing you agree your work is licensed under [Apache-2.0](LICENSE).
