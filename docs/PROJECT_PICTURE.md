# Viokit — project picture

> Status: **in progress**, agreed question by question on 2026-11-13. Decisions below are settled;
> open questions at the end are not. Supersedes the "human-gated" delivery model recorded at the
> `v0.1.0-tdr-gated` tag.

## What it is

An Effect v4 OSINT investigation engine that builds an **investigation tree** from a seed. The
original goal stands (a Maltego-class engine, open-domain packs, rapid creation of new sources by
agents). What changes is who drives it and what it promises.

## Settled

| # | Decision | Consequence |
|---|---|---|
| 1 | **Agents first, a human watches.** Agents drive and read the tree through the CLI and Engine. The console is a window onto what they found. | Console work (map, timeline, docking workbench) drops in priority. Agent parity (I8) is what keeps the surfaces honest. |
| 2 | **Invariants.** Keep I1, I2, I4, I5, I6, I8, I10. Relax I3 (deterministic replay), I7 (version pinning), I9 (cache transparency), I11 (offline determinism) to "record, do not guarantee". Defer I12 (view state). | Replay and pinning work is not built. Provenance (I2) stays because it is the tree's parent edge. Execution and egress stay owned by `SourceRuntime` (I4, I10). |
| 3 | **Active tools run with no scope.** Anything wrapped can run against any target. The `passive`/`active` label stays as metadata. | The `exec-transport` spec changes: active sources are no longer refused by default. The responsibility for what is aimed at what is the owner's. |
| 4 | **Done means seed to tree, unattended.** One seed (a domain) expands with no human input through at least 5 wrapped tools across 3 entity types into a tree of 50 or more nodes, each tracing to the run that produced it. A new tool is one manifest, one parser and one fixture test. | An auto-expander is required, not optional. The unit an agent delivers is a tool, and it must be checkable without a human. |
| 5 | **Tools run in a Kali container sidecar.** The engine talks to a container image holding the toolbox. | `exec` runs commands in the container, not on the host. Isolation from the engine's files and secrets comes from the container. Docker 27.3.1 is present on the dev machine. |
| 6 | **MCP is not used for wrapping.** Existing MCP front-ends stay as they are. | One tool kind: a CLI tool through `exec`. |
| 7 | **The TDR gate is replaced** by spike-before-adopt: a change that adds a dependency, transport, store or format records a spike result in `design.md`. No sign-off. | See `.agents/skills/viokit-build/SKILL.md`. Not yet mechanically enforced. |
| 8 | **Shared vocabulary, one lane.** Entity and relation types live in one vocabulary that a single steward lane edits. Tool agents use existing types; a missing one is requested and stubbed. Each tool is one directory, so tool agents never share a file. A check fails any tool that defines its own type. | Parallel tool wrapping without type drift. The steward lane is a serial bottleneck by design. |
| 9 | **Merge gate: hidden conformance tests are the gate; a review agent is a filter.** A change merges into an `integration` branch when typecheck, lint, tests and the held-out conformance tests pass, no test or spec file was changed by the author, and a separate read-only review agent (a fresh process, a different model) finds no confirmed defect. You promote `integration` to `main` and tag each promotion. *Revised after research:* agents edit or special-case tests, and evidence that an independent reviewer catches more defects is thin, so the tests carry the gate and the reviewer's recall is to be measured with seeded defects before it is relied on. | No human reads individual changes. You read integration. Throughput is bounded by the checks. |
| 10 | **Conformance tests, in this order** (proposed, not yet confirmed): I4/I10 (nothing outside the runtime performs I/O or starts a process), I2 (no graph write without evidence), I6 (decode at every boundary), I1, I5, I8. They are held out: the author agent cannot see or edit them. | The invariants agent-written tools are most likely to break come first. |
| 11 | **Delivery loop** (proposed). A plain orchestrator script loops over OpenSpec changes, claims one disjoint change at a time, runs a fresh headless author in a git worktree off `integration` with turn and cost caps, then gates, then the reviewer, then merge. `tasks.md` and commits are the handoff. Permissions: `dontAsk` with an explicit allow list. Pushes to `main` are denied. | Reproducible and unattended. Agent teams are avoided because they cannot run headless. A Workflow is used only for fan-out with schema-checked results. |
| 12 | **Tool manifest and wrapping** (proposed). Fields: `id`, tool `version`, `binary`, `argv_template`, `input_type`, `output_types`, typed `params` with bounds, `risk`, `timeout_s`, `max_output_bytes`, `rate_limit`, `dedup_scope`. Input is validated by entity type before it becomes one argv element; agents cannot supply raw flags. Dispatch is by entity type. The tree has depth, entity-count and wall-time caps. Slim container image with only wrapped tools. | Tightens the `exec-transport` design. First ten tools: subfinder, dnsx, httpx, nmap, naabu, theHarvester, dig, whois, amass, nuclei. |

## Changes this forces on drafted work

- `exec-transport`: run in the container, not on the host (the working directory and environment
  limits move into the container call); drop the active-by-default refusal; keep proxy refusal and
  argument-injection checks, which still matter inside a container.
- A new change is needed for the sidecar: image, lifecycle, and how the engine reaches it.
- The `investigation-tree` change gains the auto-expander as a hard requirement.

## Open

1. Confirm the conformance-test order in decision 10.
2. Confirm decisions 11 and 12. In particular the permission posture, which is a doc choice only: nothing has been applied to any settings file.
3. Unverified, to test before relying on them: whether Workflow agents get worktree isolation, whether auto mode would block pushes to `integration`, whether a `--max-budget-usd` flag exists, and how a shared vocabulary drifts between agents (no evidence found).
4. Cost control: one documented 16-agent run cost just under $20k. Per-task turn and cost caps are required, and runaway-loop controls need a design.
