# Last task number — `T6` · next block letter — `B`

> **Single source of truth for the next free task number.** The next new task is
> `T7`; after assigning it, bump the number above and the log line below.
>
> T-numbers are **non-contiguous across blocks** — never infer the next number
> from a block's header range or a `git log` scan. This counter is authoritative.
> The block letter has the same hazard: **`CHANGELOG.md` is authoritative for the
> real maximum block**, not `ROADMAP.md` (which lists only unshipped work).

## Rule

1. **Before creating a task**, read the number above and use `T<n+1>`.
2. **After creating it**, increment the number above and append a log line below.
3. Never infer the next number from a block header range or a `git log` scan.
4. **Before creating a new block**, use the next block letter above; confirm the
   real maximum by grepping `CHANGELOG.md`, then bump the letter after creating it.

## Log (most recent first)

- **T5 SHIPPED** (Block A — regen.yml manual-dispatch workflow: pipeline with secret API keys → apply on throwaway branch → open PR with diff report; never writes main, never auto-merges) — 2026-07-21.
- **T6 CREATED** (💭, Block A §III — branded custom domain for the endpoint) — 2026-07-21.
- **T5 CREATED** (💭, Block A §II — opt-in CI regeneration that opens a PR, never auto-merges) — 2026-07-21.
- **T4 CREATED** (💭, Block A §I — extended self-hosted/aggregator sources Ollama/Bedrock/HuggingFace behind SourceAdapter) — 2026-07-21.
- **T3 SHIPPED** (Block A — repo extraction: standalone openviglet/models-catalog, Pages publish workflow, reference docs, roadmap set + roadmap-docs skill, README/agents/CLAUDE/LICENSE; Turing switched to remote-only consumption) — 2026-07-21.
- **T2 SHIPPED** (Block A — multi-source regeneration pipeline: SourceAdapter + offline cache + merge/reconciliation + validation/diff review gate + npm run regen + 10 node:test; orig. Turing BD T764-T770) — 2026-07-21.
- **T1 SHIPPED** (Block A — canonical catalog + JSON Schema + emit + public CORS-open JSON API; orig. Turing BC T759-T763) — 2026-07-21.
