# Core Schema

## Purpose

Defines the shared Effect Schema contract — the primitives and the capability-boundary interface
types that every Viokit interface (CLI, API, MCP, UI) and capability consumes. It is the single
source of truth for what crosses any boundary.

## Requirements

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
(`live` / `cache` / `proxy` / `manual`). A `manual` path SHALL record who retrieved the artifact,
so evidence a person gathered is as attributable as evidence the pipeline fetched.

#### Scenario: Evidence carries its acquisition path
- **WHEN** evidence is produced by the pipeline
- **THEN** its record includes a non-empty `AcquisitionPath` value

#### Scenario: Manually acquired evidence names its retriever
- **WHEN** evidence is recorded as manually acquired
- **THEN** its acquisition path identifies the person or agent that retrieved it, and may record where it came from

#### Scenario: Manual acquisition without a retriever is rejected
- **WHEN** evidence is submitted as manually acquired with no retriever recorded
- **THEN** it is rejected at the boundary and nothing is stored (I6)

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

### Requirement: Sources carry an access classification
A source specification SHALL carry how the source is reached — an open API, a dataset, a browser-only
interface, or one requiring credentials — drawn from the same vocabulary the discovery harness uses to
classify candidates, so the classification survives promotion rather than being discarded. A source
whose classification is unknown SHALL say so explicitly rather than defaulting to a reachable kind.

#### Scenario: A promoted source keeps its classification
- **WHEN** a candidate classified as browser-only is promoted into a source specification
- **THEN** that specification records the browser-only classification

#### Scenario: An unclassified source is explicit about it
- **WHEN** a source specification is created without an access classification
- **THEN** its classification reads as unknown, not as an open API

### Requirement: Source credentials are referenced, never carried
A source specification SHALL declare the credential it needs as a *reference* to a secret held
outside the specification, together with how the credential is to be applied to a request. A
specification SHALL NOT be able to carry a credential value itself, so that a credential cannot be
written into a pack or committed to version control.

#### Scenario: A credential-gated source names its secret
- **WHEN** a source that requires a credential is specified
- **THEN** it records the name of the secret to resolve and how to apply it, and no credential value

#### Scenario: A specification carrying a literal credential is rejected
- **WHEN** a source specification is decoded that carries a credential value rather than a reference
- **THEN** decoding fails (I6)
