# Model Catalog — Design rationale (IMPROVEMENTS)

> The *what/why* for **unshipped** sections only. No status tables, no shipped
> implementation reports (those live in `git log` + [CHANGELOG.md](CHANGELOG.md)).
> Status lives only in [ROADMAP.md](ROADMAP.md).

> **Guardrails these all respect.** Every task below is inline HTML/CSS/JS or an
> emitted static file — **no build step, no runtime, no npm dependency, no server-side
> query**, no pricing, and no envelope-shape break (`version` stays `1`). New consumer
> artifacts are *derived* from the canonical file at emit time, exactly like today's
> `index.json` / faceted slices, so they can never drift from the source of truth.

## §E — Community & contribution

Adoption isn't just consumption; a reference the community *owns* is one it can correct
and extend. These lower the barrier to contributing and make the data's completeness
honest and visible.

### §E2 — T29 · Coverage & gaps transparency
Trust grows when gaps are visible, not hidden. Emit a `coverage.json` (per-vendor,
per-field fill rate — e.g. "context window known for 82% of vendor X") and surface it in
a small site section. Every red cell is an explicit, low-friction invitation to
contribute (via T28), turning incompleteness from a weakness into a community to-do list.
