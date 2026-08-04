## Purpose

Defines the shared Effect Schema contract — the primitives and the capability-boundary interface
types that every Viokit interface (CLI, API, MCP, UI) and capability consumes. It is the single
source of truth for what crosses any boundary.

## ADDED Requirements

### Requirement: Shared primitive schema
The system SHALL define the core primitives as a shared Effect Schema: `Entity`, `Relation`,
`Event`, `Identifier`, temporal extent, spatial extent, `Evidence`, `Step`, and `AcquisitionPath`.
All capabilities SHALL use this same schema for their boundary types.

#### Scenario: Primitives are encoded and decoded
- **WHEN** a caller encodes a primitive value and decodes it back
- **THEN** the round-trip value exactly equals the original, with no data loss

### Requirement: Schema-first boundaries
Every boundary of the system SHALL decode incoming data through the shared schema and reject input
that does not conform. The system SHALL never trust unvalidated input across a boundary.

#### Scenario: Invalid instance is rejected at the boundary
- **WHEN** a value that violates the schema is submitted at a boundary
- **THEN** the boundary returns a schema-validation error and the value is not accepted

#### Scenario: Valid instance passes the boundary
- **WHEN** a value that conforms to the schema is submitted at a boundary
- **THEN** the boundary accepts it and exposes the typed value to the capability

### Requirement: Temporal validity
The system SHALL reject temporal extents where `validFrom` is later than `validTo`, and SHALL reject
evidence whose `observedAt` is in the future.

#### Scenario: Invalid temporal extent is rejected
- **WHEN** an instance carries a temporal extent with `validFrom` after `validTo`
- **THEN** the boundary rejects it as a schema-validation error

#### Scenario: Future-dated evidence is rejected
- **WHEN** evidence is submitted whose `observedAt` is after the current system time
- **THEN** the boundary rejects it as a schema-validation error

### Requirement: Evidence content addressing
Evidence SHALL be identified by a content hash computed from its raw bytes at write time. Two
evidence records with identical bytes SHALL yield the identical id; any change to bytes SHALL yield
a different id.

#### Scenario: Same bytes produce the same id
- **WHEN** two evidence records with identical raw bytes are written
- **THEN** they resolve to the same content-derived id

#### Scenario: Changed bytes produce a different id
- **WHEN** evidence bytes are modified between writes
- **THEN** the resulting id differs from the id of the unmodified bytes

### Requirement: Acquisition path recorded
Every `Evidence` record SHALL record an `AcquisitionPath` indicating how it was acquired
(`live` / `cache` / `proxy`).

#### Scenario: Evidence carries its acquisition path
- **WHEN** evidence is produced by the pipeline
- **THEN** its record includes a non-empty `AcquisitionPath` value

### Requirement: Provenance closure contract
The graph-insert boundary SHALL require a `Step` referencing at least one evidence id; an insert
without such a reference SHALL be rejected.

#### Scenario: Graph insert requires a step with evidence
- **WHEN** a caller attempts a graph insert without a `Step` referencing at least one evidence id
- **THEN** the boundary rejects the insert as a provenance error

### Requirement: Capability seam types
The shared schema SHALL expose the interface types for the evidence store, the graph store, and the
source runtime, so that any implementation of those seams satisfies the same contract.

#### Scenario: A seam implementation satisfies the contract
- **WHEN** an evidence-store, graph-store, or source-runtime implementation is provided
- **THEN** it satisfies the shared interface types defined in the schema contract
