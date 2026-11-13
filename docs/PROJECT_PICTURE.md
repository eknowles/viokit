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

## Changes this forces on drafted work

- `exec-transport`: run in the container, not on the host (the working directory and environment
  limits move into the container call); drop the active-by-default refusal; keep proxy refusal and
  argument-injection checks, which still matter inside a container.
- A new change is needed for the sidecar: image, lifecycle, and how the engine reaches it.
- The `investigation-tree` change gains the auto-expander as a hard requirement.

## Open

1. How work is split so many agents can proceed in parallel without colliding (ontology types are
   the main collision risk).
2. What replaces human review before merge: which checks are mechanical, and which an agent
   reviews.
3. Which invariants become executable conformance tests, and in what order.
4. How the delivery loop stages work and what the research pass on harness, loop and skill
   techniques should produce.
