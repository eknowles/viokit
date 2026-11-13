## Purpose

Grows an investigation from a single seed by running every applicable transform on every entity it finds, under limits, and records each run so the resulting tree can be read back with its provenance.

## ADDED Requirements

### Requirement: A transform declares what it accepts
The system SHALL let a transform declare the entity kind it accepts and the input field that receives that entity's value, and SHALL NOT expand a transform that declares nothing.

#### Scenario: A declared transform is applicable
- **WHEN** an entity of the accepted kind is in the graph
- **THEN** the transform is applicable to it, with the entity's value as the declared input field

#### Scenario: An undeclared transform is never expanded
- **WHEN** a transform declares no accepted kind
- **THEN** the expander does not run it

### Requirement: Expansion starts from a recorded seed
The system SHALL record a seed as evidence and add the seed entity to the graph with that evidence, so that no entity is present without provenance.

#### Scenario: Seeding a domain
- **WHEN** an expansion is started with a domain seed
- **THEN** the graph holds that domain, attributed to recorded seed evidence

### Requirement: Every applicable pair runs once
The system SHALL run each applicable (entity, transform) pair at most once per investigation and SHALL expand the entities each run adds, until nothing applicable remains or a cap is reached.

#### Scenario: A discovered entity is expanded
- **WHEN** a run adds an entity of a kind another transform accepts
- **THEN** that transform is run on the new entity

#### Scenario: A pair is not repeated
- **WHEN** an entity is reached twice by different runs
- **THEN** each applicable transform runs on it once

### Requirement: Caps bound the expansion
The system SHALL stop an expansion at a maximum depth, a maximum number of entities, a maximum number of runs, or a maximum elapsed time, and SHALL report which cap stopped it.

#### Scenario: Depth cap
- **WHEN** entities exist at the maximum depth
- **THEN** no transform is run on them and the expansion reports it stopped for depth

#### Scenario: Entity cap
- **WHEN** the number of entities reaches the cap
- **THEN** the expansion stops and reports it stopped for entities

#### Scenario: Nothing left
- **WHEN** every applicable pair has been run
- **THEN** the expansion ends and reports it was exhausted

### Requirement: Failures and unrunnable sources do not stop the tree
The system SHALL record a failed run and continue, and SHALL skip a transform whose source is not runnable in the deployment once, with the reason, instead of failing for every entity.

#### Scenario: A run fails
- **WHEN** a transform fails for one entity
- **THEN** the failure is recorded with its message and the other pairs still run

#### Scenario: A source is not runnable
- **WHEN** a transform's source needs a credential the deployment does not have
- **THEN** the transform is reported skipped once with the reason, and is not attempted per entity

### Requirement: Every run is recorded
The system SHALL write a run record for each run stating the transform, the input entity, the start time, the duration, the outcome, and the entities and relations it added, and SHALL be able to rebuild the tree from these records.

#### Scenario: Tracing an entity to its run
- **WHEN** an entity was added by a run
- **THEN** its run record names the transform and the entity that led to it

#### Scenario: Reading the tree
- **WHEN** the tree is shown
- **THEN** it lists runs nested under the entities that caused them, with each run's outcome

### Requirement: The expander uses the same path as every other caller
The system SHALL run transforms and commit steps only through the engine's public operations, and SHALL expose expansion through the shared operation table so every front-end has it.

#### Scenario: No privileged path
- **WHEN** the expander runs a transform
- **THEN** it does so through the engine's transform operation and commits through the engine's insert operation

#### Scenario: Available on every surface
- **WHEN** the operation table is listed through the CLI, the MCP server and the HTTP API
- **THEN** the expansion and tree operations appear on each

### Requirement: Which tool kinds run is a policy, not a refusal
The system SHALL accept a policy naming the tool kinds that may run, defaulting to both passive and active, and SHALL NOT refuse a transform for its kind when the policy allows it.

#### Scenario: Passive only
- **WHEN** an expansion is started with a policy of passive only
- **THEN** transforms whose source is active are not run and are reported skipped for policy

#### Scenario: Default policy
- **WHEN** an expansion is started with no policy
- **THEN** active and passive transforms both run
