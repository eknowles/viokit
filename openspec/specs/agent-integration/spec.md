# Agent Integration

## Purpose

Lets agents and humans discover what a running deployment can do and drive it, over one self-describing catalog and two logic-free front-ends that exercise the same engine paths with no privileged bypass.

## Requirements

### Requirement: The catalog is self-describing
The catalog SHALL report every source, transform, and ontology type registered in the running deployment, and each entry SHALL carry enough detail — its identifier, kind, human-readable name, and description — for a caller to understand what it does without reading the implementation.

#### Scenario: Registered capability is listed
- **WHEN** the catalog is listed on a deployment with registered packs
- **THEN** the response includes an entry for each registered source, transform, and ontology type

#### Scenario: An empty deployment reports an empty catalog
- **WHEN** the catalog is listed on a deployment with no packs registered
- **THEN** the response is empty and is not an error

### Requirement: Catalog listings are filterable
The catalog SHALL narrow its listing by entry kind, by owning pack, and by transform archetype, so a caller can find the relevant slice without retrieving the whole catalog.

#### Scenario: Filtering narrows the listing
- **WHEN** the catalog is listed with a kind, pack, or archetype filter
- **THEN** only entries matching every supplied filter are returned

#### Scenario: A filter matching nothing returns empty
- **WHEN** the catalog is listed with a filter no entry satisfies
- **THEN** the response is empty and is not an error

### Requirement: Entries describe their invocation contract
Describing a catalog entry SHALL return its input and output schemas in an encoded, language-neutral form, so a caller can construct a valid invocation and interpret the result without access to the implementation's types. Describing an unknown identifier SHALL fail with an unknown-entry error rather than an empty success.

#### Scenario: A transform describes its input and output
- **WHEN** a registered transform entry is described
- **THEN** the response carries its archetype and its input and output schemas in encoded form

#### Scenario: A described contract accepts a constructed invocation
- **WHEN** a caller builds an input from a described transform's encoded input schema and invokes that transform
- **THEN** the input passes boundary decoding (I6)

#### Scenario: Unknown identifiers are an error
- **WHEN** an identifier absent from the catalog is described
- **THEN** the catalog reports an unknown-entry error

### Requirement: Packs are registered explicitly
A deployment's capability SHALL come from packs registered with it through an explicit manifest, and registration SHALL be the only way pack content enters the catalog. Registering a pack whose content is invalid SHALL fail with a registration error and SHALL leave the catalog unchanged.

#### Scenario: Registering a pack populates the catalog
- **WHEN** a pack manifest is registered with a deployment
- **THEN** that pack's sources and transforms appear in the catalog attributed to it

#### Scenario: Unregistered packs are invisible
- **WHEN** pack files exist but no manifest for them is registered
- **THEN** their sources and transforms do not appear in the catalog

#### Scenario: Invalid registration leaves the catalog untouched
- **WHEN** a manifest carrying content that fails schema decoding is registered
- **THEN** registration reports an error and no entry from that manifest is added

### Requirement: Agents drive the engine over a tool surface
The agent-facing surface SHALL expose the engine's operations as tools: catalog listing and describe, running a transform, correlating staged entities, committing steps, reading the step log, querying an entity, replaying, and the four graph query surfaces. Tool inputs SHALL be decoded against the shared schema before reaching the engine, and a decode failure SHALL be reported to the caller as an error without engine state changing.

#### Scenario: An agent runs the full loop over tools
- **WHEN** an agent lists the catalog, runs a listed transform, commits the staged steps, and queries the graph, all through tools
- **THEN** each call succeeds and the graph reflects the committed steps

#### Scenario: Malformed tool input is rejected at the boundary
- **WHEN** a tool is called with input that fails schema decoding
- **THEN** the call returns an error and no engine state changes (I6)

#### Scenario: Engine errors reach the caller as errors
- **WHEN** an engine operation invoked through a tool fails
- **THEN** the failure is reported to the caller as an error rather than a successful result

### Requirement: Humans drive the engine over a command surface
The human-facing surface SHALL expose the same operations as terminal commands, SHALL decode command input against the shared schema, and SHALL report results and failures in a form usable by scripts.

#### Scenario: Every tool operation has a command
- **WHEN** the two surfaces are compared
- **THEN** each operation on the agent-facing surface has a corresponding command, and neither surface offers an operation the other lacks

#### Scenario: A command reports failure distinguishably
- **WHEN** a command's operation fails
- **THEN** the command reports the failure in a way a script can distinguish from success

### Requirement: Front-ends hold no logic and grant no privilege
Both front-ends SHALL be adapters over the one engine service: they SHALL NOT implement engine behavior, SHALL NOT perform network input or output themselves, SHALL NOT select cache mode or egress route, and SHALL NOT offer any path that reaches evidence, the step log, or the graph other than through the engine (I8, I4/I10).

#### Scenario: Both surfaces produce identical results
- **WHEN** the same operation with the same input is invoked on the agent surface and on the human surface against the same deployment
- **THEN** both produce the same result and the same engine state change

#### Scenario: Substituting the engine substitutes all behavior
- **WHEN** a front-end is run against a substituted engine implementation
- **THEN** every operation's behavior comes from that implementation, demonstrating the front-end contributes none

#### Scenario: No bypass of provenance
- **WHEN** a caller attempts to place a vertex or edge into the graph through any front-end operation without an evidence-attributed step
- **THEN** the attempt is rejected (I2)

### Requirement: Catalog entries report runnability
A source entry in the catalog SHALL state whether this deployment can actually acquire it, and when
it cannot, the reason. Listings SHALL filter on runnability, so a caller can ask for what is usable
here rather than reading a flat list in which unusable sources are indistinguishable.

#### Scenario: An unusable source is marked and explained
- **WHEN** the catalog lists a source classified as browser-only in a deployment with no browser
  transport
- **THEN** that entry reports that it is not runnable, and gives the reason

#### Scenario: Listings narrow to what is usable
- **WHEN** the catalog is listed filtered to runnable sources
- **THEN** only sources this deployment can acquire are returned

#### Scenario: Registration is still reported in full
- **WHEN** the catalog is listed without a runnability filter
- **THEN** registered sources are returned whether or not they are runnable, each carrying its status

### Requirement: Evidence can be submitted through the front-ends
Both front-ends SHALL expose an operation that submits externally acquired bytes as evidence, so a
source the engine cannot fetch can still be used: a person or an agent retrieves the artifact and
submits it, recorded as manually acquired with its retriever (I9). The submission SHALL be decoded
at the boundary (I6) and stored content-addressed and write-once like any other evidence (I1).

#### Scenario: Manually retrieved bytes become evidence
- **WHEN** a caller submits retrieved bytes with a retriever and origin through either front-end
- **THEN** the evidence is stored, its acquisition path records the manual retrieval, and its
  identity is the content hash

#### Scenario: The same submission on either surface behaves identically
- **WHEN** the same submission is made through the agent surface and the human surface
- **THEN** both produce the same stored evidence and the same identity

#### Scenario: A malformed submission is rejected
- **WHEN** a submission omits its retriever or carries a payload that fails decoding
- **THEN** the call returns an error and no evidence is stored

#### Scenario: Submitted evidence is usable by the rest of the surface
- **WHEN** evidence submitted this way is referenced by a step committed through the front-end
- **THEN** the commit is accepted, because the step is attributed to stored evidence (I2)
