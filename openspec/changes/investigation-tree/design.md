## Context

The engine already offers what the expander needs: `runCatalogTransform(id, input)` returns staged, evidence-attributed steps; `insert(step)` commits one; `replay` returns the graph; the catalog reports whether a source is runnable. Steps carry `evidenceIds`, `sourceId` and `transformId`, but nothing records which entity triggered a run, and one run's steps are only grouped by sharing an evidence id. Entity ids for domains and addresses are their plain values, so tools meet on the same node. See `proposal.md`.

## Goals / Non-Goals

**Goals:** unattended expansion from one seed through every applicable tool, bounded, with each entity traceable to its run, on the same path every other caller uses.

**Non-Goals:** parallel runs, ranking branches, resuming after a crash, a console view.

## Spike

Run 2026-11-14 as `packages/engine/test/tree-preconditions.test.ts`, against the real engine with the `web-dns` pack and a stub transport. It is kept as a permanent test.

| Question | Result |
|---|---|
| Does committing the same entity from two runs leave one entity? | **Yes.** Running `dig-resolve` twice and committing both runs' steps leaves one entity for the address and one for the domain after `replay`. Dedup by id holds. |
| Does the catalog report runnability per transform? | **No.** Transform entries carry no `runnable`. It is reported on **source** entries (with a `reason`). A transform reaches its source through the manifest (`RegisteredTransform.source`), so the expander reads the registry and the source entries, not the transform entries. |
| Can a seed be recorded as attributed evidence? | **Yes**, through `engine.ingest(input, by)`: `by` (the acquiring principal) is required, and omitting it fails with "Expected string at acquiredBy". The seed entity is then inserted with that evidence's id. |
| Does a bare engine run exec sources? | **No.** The engine layer declares transports through `TransportCapabilities`; the default is `http` and `dataset`. A deployment (and a test) must declare `exec`, or the source is refused with "source declares transport 'exec', which this deployment does not provide". |

Consequences: the expander is built inside the engine package, next to the registry; it takes a small port (run, insert, ingest, entities, source status, clock, run log) so it can be tested without a database; seeding takes the principal.

## Decisions

### 1. `accepts` on the transform spec, optional
`{ kind, field }`. The expander takes the entity's first identifier value as the input field. An undeclared transform is invisible to the expander, so nothing changes for packs that do not opt in.

### 2. Runs are recorded in a separate append-only log, not in the step log
A run record is about orchestration (which entity led to which run, how it ended, how long it took, including failures that produced no steps). The step log holds assertions about the world and must stay that. The log is a filesystem JSON-lines store behind a seam, the shape the redaction and view-state stores already use, scoped per investigation. The tree is read back from the records plus each run's steps; nothing else is stored.

### 3. Serial, breadth-first, one pass per depth
Level by level: all pairs at depth 1, then 2. Serial keeps the first version simple to reason about and to test deterministically. The exec transport already has its own concurrency permit, so parallelism can be added later without changing the contract.

### 4. Depth is the number of runs between the seed and an entity
The seed is depth 0. An entity added by a run on a depth-n entity is depth n+1. An entity reachable by two paths keeps the shorter depth.

### 5. The seed is recorded through the existing evidence path
The seed's value and kind are submitted as evidence the way a manual submission is, then the seed entity is inserted attributed to it. No bare insert exists to bypass (I2).

### 6. Defaults: depth 3, 200 entities, 100 runs, 10 minutes
Chosen so a first unattended run is bounded by minutes and by tens of tool calls. All four are arguments.

### 7. Unrunnable sources are skipped before the loop
The runnability the catalog already reports is read once. A transform whose source is not runnable is listed as skipped with its reason and never attempted per entity.

### 8. A failure is a recorded run, not an exception
The expander catches a transform's typed failure, writes the run record with the message, and continues. It does not retry: a retry policy belongs to the runtime.

### 9. Policy by kind
`kinds: ["passive", "active"]` by default, per the project decision that active tools are not refused. Exec sources report their kind through the catalog; sources that are not exec count as passive.

## Risks / Trade-offs

- **An unattended expansion with active tools scans everything it discovers**, including third-party addresses that a name resolves to (shared hosting, content delivery networks). That is the consequence of the no-scope decision, not an accident. The mitigation is the caps and an explicit `kinds` argument; a scope allowlist is future work.
- **Fan-out can explode** (a certificate search can return hundreds of names) → caps on entities and runs, depth counted from the seed.
- **Serial runs make wide trees slow** → acceptable for a first version; the time cap bounds it.
- **A run's added entities are found by diffing the graph before and after** unless the staged steps expose them directly; the first version reads them from the staged steps it just committed.
- **Entity identity** → relies on the vocabulary's plain-value ids for domains and addresses; kinds without a natural id are prefixed.
