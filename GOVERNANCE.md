# Governance

This document makes the "community-owned, by Viglet" relationship explicit: who
maintains the Model Catalog, and how decisions are made.

## What this project is

The Model Catalog is a **vendor-neutral, community-owned reference** — a public,
unbranded resource that anyone can read, reuse (data under
[CC-BY 4.0](LICENSE-DATA); code under [Apache-2.0](LICENSE)), and contribute to.
It deliberately lives at a neutral URL (`openviglet.github.io/model-catalog`)
rather than under a product brand, so it reads as a shared resource and not a
marketing asset.

## Who maintains it

The project is stewarded by **Viglet** (<https://www.viglet.org>) as the current
maintainer, together with community contributors. Viglet maintains the repo,
reviews contributions, operates the publish pipeline, and is the point of
contact for security and conduct matters. Maintainership is a stewardship role,
not ownership of the data — the catalog is a community asset.

## How decisions are made

- **Everyday changes** (model additions/corrections, doc fixes) follow the
  [contribution flow](CONTRIBUTING.md): open a proposal or PR, a maintainer
  reviews it for provenance and scope, and merges it once it meets the bar. Data
  changes always go through the **propose-and-review** pipeline — the canonical
  file is only written by an explicit `regen -- --apply`, and CI may open a PR
  but never auto-merges one. A bad upstream fetch can never silently publish.
- **Direction and larger changes** (new fields, new artifacts, scope calls) are
  tracked openly in [`docs/ROADMAP.md`](docs/ROADMAP.md) with rationale in
  [`docs/IMPROVEMENTS.md`](docs/IMPROVEMENTS.md) and positioning in
  [`docs/STRATEGY.md`](docs/STRATEGY.md). Maintainers make the final call,
  guided by the project's standing constraints below and by discussion on
  issues/PRs. Disagreements are resolved by discussion first; the maintainers
  decide when consensus isn't reached.

## Standing constraints (the neutrality guarantees)

These are binding on every change, and are what keep the reference trustworthy
and genuinely neutral:

- **Vendor-neutral.** No vendor is favored; vendor names are used only to
  identify their models (nominative use). Viglet is independent and not
  affiliated with or endorsed by any listed vendor.
- **Provenance-first.** Regenerated entries carry `sources` + `lastVerified`; a
  missing field beats a guessed one. Pricing is an *indicative* US list
  reference only — never authoritative, never invented.
- **Additive & stable.** The envelope stays at `version: 1`; new fields are
  optional and additive so consumers never break.
- **Self-contained & zero-dependency.** The pipeline, emit step and SDKs use
  only platform built-ins; the page ships no runtime dependency. This is a
  deliberate durability bet, not an accident.

## Getting involved

Start with [CONTRIBUTING.md](CONTRIBUTING.md). The lowest-friction contribution
needs no code at all — propose or correct a model via the issue form. Conduct is
governed by the [Code of Conduct](CODE_OF_CONDUCT.md); security reports follow
[SECURITY.md](SECURITY.md).
