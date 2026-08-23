# Engine Runtime

## Purpose

Defines the in-memory engine that realizes the schema seams and runs a single thin end-to-end
pipeline — source, evidence, graph insert, query, and replay — as the Stage 0 proof of the
architecture.

## Requirements

### Requirement: Source-to-evidence pipeline
The engine SHALL run a source acquisition end-to-end: fetch through the source runtime, produce
`Evidence` with an `AcquisitionPath`, and record it in the evidence store.

#### Scenario: A source run produces recorded evidence
- **WHEN** an HTTP source is executed through the engine
- **THEN** evidence is produced with an `AcquisitionPath`, stored, and retrievable by its id

### Requirement: Graph insert with provenance
The engine SHALL insert graph vertices and edges only via a `Step` that references at least one
evidence id, and SHALL reject bare inserts.

#### Scenario: Insertion requires a step
- **WHEN** a graph insert is attempted without an attached `Step` referencing evidence
- **THEN** the engine rejects the insert

#### Scenario: Insertion with provenance succeeds
- **WHEN** a graph insert is made with a `Step` referencing at least one evidence id
- **THEN** the vertex or edge is added to the graph and associated with that `Step`

### Requirement: Query by id
The engine SHALL retrieve stored evidence and graph items by id through the seam interfaces.

#### Scenario: Retrieval by id
- **WHEN** a stored item is queried by its id
- **THEN** the engine returns the matching item

### Requirement: Deterministic replay
The engine SHALL reproduce the same graph state from a replay of its step log as from the original
execution.

#### Scenario: Replay reproduces state
- **WHEN** the engine replays the step log of a prior execution
- **THEN** the resulting graph state equals the state produced by the original execution

### Requirement: Evidence immutability
The engine SHALL treat stored evidence as write-once: no code path may mutate a stored artifact, and
any change produces a new artifact with a new content-derived id.

#### Scenario: Stored evidence is immutable
- **WHEN** the engine is asked to alter previously stored evidence
- **THEN** the original artifact is unchanged and any change yields a new artifact and id

### Requirement: No in-place history mutation
The engine SHALL treat the step log as append-only and SHALL NOT mutate or delete history entries.

#### Scenario: Step log is append-only
- **WHEN** the engine records a step after history already exists
- **THEN** prior history entries remain unchanged and the new step is appended

### Requirement: Engine runs a transform into attributed steps
The engine SHALL run a transform through its source runtime, persist the resulting evidence, project it into graph operations, and wrap each operation in a `Step` attributed to that evidence. It SHALL return the resulting steps as staged output and SHALL NOT require the caller to stage them separately from the graph commit.

#### Scenario: A transform produces attributed steps
- **WHEN** the engine runs a transform against a source through the `Engine` seam
- **THEN** each resulting `Step` references at least one evidence id from the run and the steps are returned ready to commit

### Requirement: Engine commits staged transforms to a graph store
The engine SHALL commit a transform's staged steps to its graph store, rejecting any step that does not reference at least one evidence id.

#### Scenario: Staged transform steps are committed
- **WHEN** the engine commits the staged output of a transform run
- **THEN** each step is appended to the step log and its vertices/edges become part of the foldable graph state

### Requirement: Engine correlates staged entities into merges
The engine SHALL, given staged steps, its current graph state, and per-kind match rules, promote any staged entity sharing a normalized identifier with an existing vertex into an append-only `ResolveEntity` merge step. It SHALL NOT rewrite existing history.

#### Scenario: A normalized-identifier collision is merged
- **WHEN** a staged entity's identifier normalizes identically to an existing vertex's identifier and a matching rule is supplied
- **THEN** the engine returns a `ResolveEntity` step attributing the staged entity as the merge and the existing vertex as canonical

### Requirement: Engine exposes the four graph query surfaces
The engine SHALL expose shortest-path (`paths`), temporal (`timeline`), spatial (`spatial`), and relatedness (`relatedness`) queries over the graph through its seam, returning domain-neutral depth-bounded paths, extent hits, and distance-ranked related entities.

#### Scenario: The engine answers a relatedness query
- **WHEN** a relatedness query is run from a seed entity through the `Engine` seam
- **THEN** the engine returns entities reachable from the seed, ranked by distance

### Requirement: Engine defaults to the retained graph store
The engine SHALL wire its default layer over the retained graph store (DuckDB replay projection), with an in-memory fallback available, so that a pipeline run exercises replay/projection rather than a throwaway store.

#### Scenario: The default engine layer replays over the retained store
- **WHEN** the default `Engine` layer is used without overriding the graph store
- **THEN** graph insert, log, and replay operate over the retained store's step log and projection

### Requirement: Engine reports the deployment's catalog
The engine SHALL expose the catalog of the running deployment — its registered sources, transforms, and ontology types — and SHALL describe any catalog entry's invocation contract, so every front-end discovers capability from one place rather than from its own registry.

#### Scenario: The engine lists registered capability
- **WHEN** the catalog is requested from an engine with registered packs
- **THEN** the engine returns the registered sources, transforms, and ontology types

#### Scenario: The engine describes an entry
- **WHEN** a registered entry is described through the engine
- **THEN** the engine returns that entry's invocation contract

#### Scenario: Catalog reporting does not alter engine state
- **WHEN** the catalog is listed or an entry described
- **THEN** no step is appended and no evidence is written (I3)

### Requirement: Evidence can be read back
The engine SHALL return a stored evidence record by its identifier, so the artifacts a graph is built
on can be inspected rather than only written. An identifier that is not stored SHALL read as absent
rather than as an error.

#### Scenario: A stored artifact is retrieved
- **WHEN** evidence is stored and then requested by its identifier
- **THEN** the engine returns that record, including how it was acquired

#### Scenario: An unknown identifier reads as absent
- **WHEN** evidence is requested for an identifier that was never stored
- **THEN** the engine reports absence

#### Scenario: Reading evidence changes nothing
- **WHEN** evidence is read
- **THEN** no step is appended and no evidence is written

### Requirement: Running a transform attributes its steps
Steps staged by running a transform SHALL carry that transform's identity and the versioned source
they were acquired from, without the caller supplying it.

#### Scenario: Staged steps are attributed automatically
- **WHEN** a transform is run
- **THEN** every step it stages records that transform and the versioned source it used

#### Scenario: Attribution accompanies evidence attribution
- **WHEN** a staged step is inspected
- **THEN** it carries both the evidence it derives from and what produced it
