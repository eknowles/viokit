## Purpose

Defines the in-memory engine that realizes the schema seams and runs a single thin end-to-end
pipeline — source, evidence, graph insert, query, and replay — as the Stage 0 proof of the
architecture.

## ADDED Requirements

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
