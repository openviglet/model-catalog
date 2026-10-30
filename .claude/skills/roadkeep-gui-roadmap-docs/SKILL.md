---
name: roadkeep-gui-roadmap-docs
description: How to work a task in this project's roadmap — the five docs/ files (ROADMAP.md, CHANGELOG.md, IMPROVEMENTS.md, DECISIONS.md, DEFERRED.md) owned by the roadkeep CLI and never hand-edited, and above all the one-task-one-commit rule: every finished roadmap task ends in one local commit — `git add -- <its paths>` then `git commit -F <message file>`, no Claude attribution, never pushed — code plus doc sync in that single commit. Use whenever adding a task, picking the next RG-number, marking a task shipped, retiring, deferring, linting, editing any of those files, executing a block or a list of RG ids, or finishing any task that touches this repo.
---

# Roadmap tasks & committing

**No figure in this file is derived from the backlog** (RG92). Counts, the priority queue
and which ids are open are all things `roadkeep` answers, and a sentence here quoting one
is a sentence that was true on the day it was written. Where you would want a number, this
file names the read instead. Keep it that way: the drift it is recovering from sent readers
to three ids that had shipped and told them a suite of a thousand tests had not arrived.

## ⛔ READ FIRST — one task, one commit (non-negotiable)

**A task is not finished until the commit landed.** Commit with plain `git`, staged by
path, from the repo root — not `run-commit.cmd`, whose `git add *` takes the whole tree:

```
cd d:\Git\alegauss\roadkeep-gui
git add -- <this task's paths>
git commit -F <message file>
```

- **Stage by path, never everything** — no `git add -A`, `.` or `*`. Another session in
  this checkout would have its files committed under your title, so
  `git diff --cached --stat` must list this task's files alone.
- **The message comes from a scratchpad file**: a conventional-commits title in ASCII, then
  a few plain lines on what changed and why. `-F` keeps it off the command line, where an em
  dash or an accent may not arrive as the bytes typed — the class upstream `RK1474` recorded.
- **No attribution, no push.** No `Co-Authored-By` trailer, no "Generated with Claude
  Code" line, no `--author`: the commit is the user's, and it stays local. Hooks run —
  never `--no-verify`.
- **The doc sync rides in the same commit as the code**, so the governed files never
  describe a state that did not ship.
- **You may NOT do more than one task before committing.** A multi-task request
  (a whole block, or a list of `RG<n>`s) is _not_ permission to batch: it is a request
  to run them one at a time, committing after each. One giant diff spanning many tasks
  is the failure this rule exists to prevent.
- **A batch of ≥2 tasks runs under the `/loop` skill** (self-paced): exactly one task
  per iteration, committed at the end of that iteration, then advance. Do not
  hand-roll a loop that defers commits to the end.
- **Self-check before starting task N+1:** `git status` / `git log -1`. If the previous
  task's work is still in the working tree, stop and commit it first.
- **Declare your paths, then read them back at the moment of committing.** A claim is dated
  by a marker write and released when the marker moves, for the window `[claims] held` sets.
  `roadkeep claim RG<n> --path <p>` says what the task will touch; **`roadkeep claim RG<n>`
  with no `--path` answers what you declared plus what the tree holds that another live claim
  says is its own — the analysis `git add -A` cannot make.** `roadkeep claims` lists held,
  expired and stale, and `[claims] held` in `roadkeep.toml` is how long one stands. This
  matters wherever two sessions run against one checkout: in the sibling `pportal` repo a
  commit made with no live claim swallowed four files of unrelated work under its own title.

The same rule applies to any finished unit of work in this repo, roadmap task or not:
when the work is done and validated, commit it the same way rather than leaving it in the
tree.

## The gate before the commit

Validated means the project's own build and test were run, not that the edit looked right.

Five commands, from the repo root, and each answers a different question:

| Command             | What it holds                                                                                                                                                                                                  | When                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` | `tsc -b` over all three packages at once, through the project references — a renderer that broke a payload shape fails here and not in a window. It emits declarations only: `tsc` compiles nothing that runs. | Every task that touches a `.ts` or `.tsx` file.                                                            |
| `npm test`          | `vitest run`, headless: `core` in Node, `ui` in jsdom. No display, so it runs the same over SSH and in CI.                                                                                                     | Every task that changes behaviour anything asserts.                                                        |
| `roadkeep lint`     | The governed files. Non-zero exit is the whole point of it.                                                                                                                                                    | Every task, without exception — it is the only gate a docs-only change has.                                |
| `npm run lint`      | `oxlint` then `prettier --check`. It holds the package split — `core` importing Electron, `ui` importing `node:`, either importing `shell` — which compiles fine and is wrong. `npm run format` is the writer. | Every task that touches a `.ts`, `.tsx`, `.json`, `.css` or `.md` file this repo owns.                     |
| `npm run build`     | Everything Vite produces: the main process and the two launchers into `packages/shell/dist`, the sandboxed preload as `preload.cjs` beside them, and the renderer into `packages/ui/dist`.                     | Before shipping anything the packaged app loads, and any task that touches a Vite config or an asset path. |

`npm run dev` opens the window against Vite with hot reload; `npm start` builds and opens
it against the bundle on disk, which is what a packaged run does. Neither is a gate — they
are how you see a change, and a screenshot beats a claim that a screen renders.

Three things worth knowing before you spend an hour on any of them.

**Every source file is TypeScript and every relative import is extensionless.** There is
no `.js`, `.mjs` or `.cjs` source in this repo — the launchers behind `npm run dev` and
`npm start` are `.ts` under `packages/shell/src` like everything else. That is what Vite
buys: it builds the main process as well as the renderer, so an import is resolved the way
a bundler resolves it and never has to name the file the compiler is about to write. The
one `.cjs` in the tree is `dist/preload.cjs`, which is build output.

**Cross-package imports go through the workspace name**, `@rk/core` and not a relative
path out of the package. The three packages are separate `tsc` projects on purpose — `core`
has neither Node nor DOM types in scope, `ui` has DOM and not Node, `shell` has Node and
not DOM — and reaching across with a `paths` alias would compile one package's source under
another's options and quietly hand it back what its own config denies it.

**`ELECTRON_RUN_AS_NODE=1` is exported by VS Code**, so an Electron started from an editor
terminal or an agent session runs as plain Node and dies on `app` being undefined;
`spawnElectron` strips it, which is why `npm run dev` and `npm start` go through a launcher
instead of calling the binary.

Do not invent a `compile.cmd` or `test.cmd` here because the sibling `pportal` repo has
them — the five above are this repo's.

**Name EVERY task id an assertion holds, not just the one you are working.** A test written
under one id often ends up holding the task that finished the work, and naming both is four
characters, while the alternative is a second test file written to move a number. The suite
is large and `npm test` says how large; a `describe` that names no id is a test nobody can
trace back to what it was for.

## ⛔ READ SECOND — five files are owned by `roadkeep`

[`roadkeep.toml`](../../../roadkeep.toml) declares this project's format — prefix `RG`,
`ref_scheme = "id"`, the markers, the limits, the requirement vocabulary — and
[`.mcp.json`](../../../.mcp.json) plus [`.claude/settings.json`](../../settings.json)
wire the rest through `.claude/hooks/roadkeep-launch.py`: a hook that **denies a
hand-edit** to any governed file and names the command that does it, the
`mcp__roadkeep__*` tools whose input schema _is_ this project's format, and the upstream
`roadkeep` skill with the whole write path. **Reach for the MCP tools first**; the shell
fallback is that launcher, not a `roadkeep` on PATH.

Start a task with `brief`, not by reading the files; `lint` is the gate.

Each file has one job — never duplicate content between them:

| File                                                    | Single responsibility                                                                                                                                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/ROADMAP.md`](../../../docs/ROADMAP.md)           | **Task status** — active backlog only (📋 designed · 💭 idea · ⏳ partial · 🛠 in-progress), one line per task, plus the `## Priority` queue, the block headings, the `## Done when` criteria and the `## Non-goals`. |
| [`docs/CHANGELOG.md`](../../../docs/CHANGELOG.md)       | What has **shipped** — the ledger, indexed by block. Authoritative for the highest block letter.                                                                                                                     |
| [`docs/IMPROVEMENTS.md`](../../../docs/IMPROVEMENTS.md) | **Design rationale** for _unshipped_ work only. Deleted per task by the ship that closes it.                                                                                                                         |
| [`docs/DECISIONS.md`](../../../docs/DECISIONS.md)       | **Constraints that outlive the work** — written only by `ship --decides`, corrected by `revise`, replaced by `supersede`. Nothing deletes an entry.                                                                  |
| [`docs/DEFERRED.md`](../../../docs/DEFERRED.md)         | Lines **set aside** by `defer`, keeping their id, deps, symptom and section. `resume` brings one back.                                                                                                               |

## The loop

- **`brief --claim`** picks the next line and briefs it in one read, taking it in the same
  transaction. **Reach for `--designed`**: most of this backlog is 💭 with its design still
  to write — `list --marker 💭` says how much — so an unscoped pick often hands you a
  `section add` and not a commit.
- **`--have <word>`** where the machine has one of the requirements `[requirements]
declared` names. Lines naming one are set aside and named, never silently dropped.
- **Order is the `## Priority` section of `docs/ROADMAP.md`**, not `roadkeep.toml` and not
  opinion. `priority list` is the read; an empty queue means the tier is off and `pick`
  falls through to the lowest ready id. `priority add` / `priority drop` are the doors.
- **The read BEFORE an add is `delivered <block> --near "<the sentence you would file>"`.**
  It ranks that block's nearest deliveries against what you are about to propose, which is
  the duplicate question asked _before_ an id is spent.
- **Adding is `add --block <x> --symptom "…" --why "…" --section "…"`.** The `§RG<n>`
  pointer is derived. A line whose section is missing is a `ref.unresolved` finding, so
  file both halves in the one transaction. `budget` prices every field first.
- **The next id is `roadkeep next-id`** — it scans every governed file and never fills a
  gap. Retired ids are never reused.
- **Keep a task line terse** — symptom (what does not work, never a fix name) + one
  sentence of why + the pointer. The reasoning belongs in the section.

## The two lists that bind a proposal

Both are governed here and both are checked _before_ work becomes a line:

- **`non-goal list`** — every entry binds. A proposal a non-goal forbids is not filed.
  Where one merely _bounds_ a line without forbidding it, the gate says so
  (`non-goal.reaches`) and the answer is recorded by quoting that lead in the line's own
  design section.
- **`criterion list`** — what would finish each block, under `## Done when — Block X`.
  **A constraint the project must keep obeying usually belongs here, not in
  `DECISIONS.md`**: a criterion survives every ship, is never deleted, and is what
  `ship --checked <lead>` verifies.

## Shipping, and the section it deletes

`ship <id> --why "<what now works>"` writes the ledger entry, clears the roadmap line and
**deletes the design section**, in one transaction or none. That deletion is correct — a
design says how the work was built and stops being true when the code moves — but it is
the last moment anything in that section can be saved.

**Read the section before you ship it**, and ask of each paragraph: _does this stop being
true when the code moves?_ The doors, in order of how often they are the right one:

| Answer                                                                      | Door                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| It explains **this module**                                                 | `--recorded-in <path>` — move the prose into that file's docstring or header. **This is the common case.**         |
| It is a rule the project must keep obeying                                  | usually not a ship flag at all — `criterion add` or `non-goal add`, which are never deleted                        |
| It is a constraint with a rejected alternative, belonging to no single file | `--decides "<the constraint>"`, plus `section add <id> --role decisions` for what was weighed — `budget` prices it |
| You read it and it had gone stale                                           | `--superseded-design "<what it was wrong about>"`                                                                  |
| Nothing survives                                                            | ship plainly — most ships are this                                                                                 |

**Never copy a section into a second file.** That is the accreting rationale this format
exists to refuse.

**A design section may carry its own instruction.** Where the author already knew what
would survive, the section ends with a line naming it — `On ship: --decides "…"` or
`On ship: --recorded-in <path>`. Honour it, revised against what was actually built.

## Everything else

- **Status lives in exactly one file.** If a marker anywhere disagrees with the roadmap, the
  roadmap wins.
- **A pause is `defer <id> --reason "…"`, not `retire`.** Retiring is terminal: the id cannot
  come back, the resolver reads the dep as never, and the section is deleted.
- **A false claim is `restate <id> --symptom "…"`**, which keeps the id, the deps, the marker
  and the design — not `retire` plus `add`, which spends an id and deletes a design that was
  right.
- **Some deps point outside this backlog** — at roadkeep's own ids, filed in the sibling
  `d:/Git/alegauss/roadkeep` checkout, and at things roadkeep has not published yet. `deps`
  names them. None resolves by shipping here, and `pick` will not offer the lines that
  carry them.
- **`lint` reports and `repair` spends the report** — every finding names the command that
  closes it, and `explain <code>` says what a code means before you guess.
