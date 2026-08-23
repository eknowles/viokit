## Purpose

Maintains a live, deduplicated, concurrency-safe catalog of candidate OSINT sources so that many agents can discover and document sources in parallel without duplicating each other's work, and so that curated candidates can be promoted into real source specifications inside packs.

## ADDED Requirements

### Requirement: Work queue with atomic claims
The catalog SHALL maintain a queue of `{category, archetype}` work units, and SHALL hand out each open unit to at most one claimant at a time, recording the claiming agent on the unit.

#### Scenario: A claim returns an open unit
- **WHEN** an agent claims work against a queue holding open units
- **THEN** the catalog returns one open unit marked claimed and attributed to that agent

#### Scenario: Concurrent claims never collide
- **WHEN** two agents claim work simultaneously
- **THEN** no unit is returned to both agents; each receives a distinct unit or no unit

#### Scenario: Uncovered units stay visible
- **WHEN** the queue is listed after seeding
- **THEN** units that no agent has claimed remain visible as open, so coverage gaps are observable

### Requirement: Claim leases expire and reopen
Each claim SHALL carry a time-to-live lease, and a unit whose lease has expired SHALL become claimable again without operator intervention, so a crashed agent does not hold a unit indefinitely. A claimant SHALL also be able to release a unit explicitly.

#### Scenario: An expired lease reopens the unit
- **WHEN** a claimed unit's lease deadline passes and work is claimed again
- **THEN** the expired unit is treated as open and may be handed to another agent

#### Scenario: Explicit release returns the unit
- **WHEN** a claimant releases a unit it holds
- **THEN** the unit returns to open and is available to the next claimant

### Requirement: Candidate identity and deduplication
A candidate's identity SHALL be a content fingerprint over its domain and URL. Submitting a candidate whose fingerprint already exists SHALL merge into the existing record rather than create a second one, unioning archetypes and notes, appending discovery provenance, and keeping the first recorded URL.

#### Scenario: A novel candidate is inserted
- **WHEN** a candidate with an unseen fingerprint is submitted
- **THEN** the catalog stores it as a new record

#### Scenario: A duplicate submission merges
- **WHEN** two agents submit candidates with the same domain and URL
- **THEN** the catalog holds exactly one record whose archetypes and notes are the union of both submissions, whose provenance lists both discoverers, and whose URL is the first one recorded

### Requirement: Immutable correction via supersede
A candidate's domain and URL SHALL be immutable once recorded. A correction to either SHALL create a new record under the new fingerprint and mark the old record rejected with a pointer to its successor; existing history SHALL NOT be edited in place.

#### Scenario: Correcting identity supersedes the old record
- **WHEN** a candidate's domain or URL is corrected
- **THEN** a new record exists under the new fingerprint
- **AND** the prior record remains, marked rejected and pointing at its successor

### Requirement: Thin candidate record decoded at the boundary
A candidate SHALL require only domain, category, URL, and archetypes, with access, transport, description, discoverer, discovery time, origin, and notes optional so agents can submit quickly and enrich later. Every candidate SHALL carry a lifecycle status of new, claimed, promoted, or rejected, and all values crossing the catalog boundary SHALL be decoded against the shared schema (I6).

#### Scenario: A minimal candidate is accepted
- **WHEN** a candidate is submitted with only domain, category, URL, and archetypes
- **THEN** the catalog accepts it with status new

#### Scenario: An invalid candidate is rejected at the boundary
- **WHEN** a submission omits a required field or carries a value outside the declared types
- **THEN** the catalog rejects it with a decode error and stores nothing (I6)

#### Scenario: Enrichment fills optional detail later
- **WHEN** an existing candidate is enriched with access, transport, or description
- **THEN** the stored record reflects the added detail while its identity is unchanged

### Requirement: Candidate listing is filterable
The catalog SHALL return stored candidates filtered by category, archetype, and lifecycle status, so curators can review a slice of the catalog rather than the whole of it.

#### Scenario: Listing narrows to a slice
- **WHEN** candidates are listed with a category, archetype, or status filter
- **THEN** only candidates matching every supplied filter are returned

### Requirement: Promotion writes a source spec into a pack
Promoting a candidate SHALL write an exported source specification into the pack file for the candidate's category, and SHALL mark the candidate promoted with a record of the promotion. Promotion SHALL NOT touch evidence or investigation history.

#### Scenario: Promotion emits a usable pack entry
- **WHEN** a candidate is promoted with an authored source specification
- **THEN** an exported source specification for it is present in that category's pack file
- **AND** the candidate's status is promoted

### Requirement: Promotion happens at most once
Promotion SHALL be promote-once: a second promotion of an already-promoted candidate SHALL fail with an already-promoted error and SHALL leave the pack file and the candidate record unchanged.

#### Scenario: Re-promotion is rejected
- **WHEN** an already-promoted candidate is promoted again
- **THEN** the catalog reports an already-promoted error
- **AND** the pack file and the candidate record are unchanged

### Requirement: Agent and human front-ends share one service
The catalog operations — claim work, submit candidate, enrich candidate, list candidates, and promote source — SHALL be exposed to agents as tools and to humans as commands, and both front-ends SHALL carry no business logic of their own so that agents and humans exercise identical behavior (I8).

#### Scenario: Agent and human paths agree
- **WHEN** the same operation is invoked through the agent-facing tools and through the human-facing commands
- **THEN** both produce the same catalog state change and the same result

#### Scenario: Every operation is reachable from both surfaces
- **WHEN** the front-ends are inspected
- **THEN** claim work, submit candidate, enrich candidate, list candidates, and promote source are each available on both

### Requirement: The queue is seeded as a coverage plan
The work queue SHALL be seedable from the project's OSINT landscape catalog as the product of its categories and archetypes, and MAY additionally be seeded from an external toolkit inventory, so that the queue expresses the intended discovery coverage rather than an ad-hoc backlog.

#### Scenario: Seeding populates the coverage grid
- **WHEN** the queue is seeded from the landscape catalog
- **THEN** the queue holds an open unit for each category and archetype pair in that catalog

#### Scenario: Seeding is additive to an existing queue
- **WHEN** seeding runs against a queue that already holds units
- **THEN** already-present units are not duplicated and their claim state is preserved
