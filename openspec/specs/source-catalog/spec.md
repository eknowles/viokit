# Source Catalog

## Purpose

Provides a live, deduplicated, concurrency-safe catalog of candidate OSINT sources so that many agents can discover, classify, and document sources in parallel without duplicating work, and so that curated candidates can be promoted into real `SourceSpec`s in packs.

## Requirements

### Requirement: Work queue with atomic claims and leases
The harness SHALL maintain a queue of `{category, archetype}` work units, and `claim_work(agent)` SHALL atomically take the next unclaimed unit, marking it `claimed` with the claiming agent and a `leasedUntil` TTL.

#### Scenario: Concurrent claims never collide
- **WHEN** two agents claim work simultaneously
- **THEN** exactly one agent wins the unit and the other receives the next open unit

#### Scenario: Expired lease reopens the unit
- **WHEN** a claimed unit's lease expires because its agent crashed
- **THEN** the unit is reopened and becomes claimable again

#### Scenario: Explicit release returns the unit
- **WHEN** an agent releases a unit it holds
- **THEN** the unit returns to `open` without waiting for the lease to expire

### Requirement: Deduplicated candidate store
The store SHALL identify a `SourceCandidate` by a content-hash fingerprint over `(domain, url)`, and `submit_candidate` SHALL insert a new record or merge into the existing record when the fingerprint matches.

#### Scenario: Duplicate submissions across agents merge
- **WHEN** two agents submit candidates with the same `(domain, url)`
- **THEN** the store holds one record with unioned archetypes and notes, appended discovery provenance, and the first `url` retained

#### Scenario: Correction supersedes rather than edits
- **WHEN** a candidate's `domain` or `url` is corrected
- **THEN** a new record is created and the old one is marked `rejected` with a `supersedes` pointer, leaving history unedited

### Requirement: Candidate record is thin and identity-required
The shared schema SHALL define `SourceCandidate` with `domain`, `category`, `url`, and `archetypes` required; `access`, `transport`, `description`, `discoveredBy`, `discoveredAt`, `origin`, and `notes` optional; and lifecycle `status ∈ {new, claimed, promoted, rejected}`.

#### Scenario: Boundary values are decoded
- **WHEN** a candidate crosses a front-end boundary
- **THEN** it is decoded against the shared schema and invalid records are rejected with a typed error (I6)

#### Scenario: Fast submit, later enrichment
- **WHEN** an agent submits a candidate carrying only the required identity fields
- **THEN** the submission succeeds and `enrich_candidate` can add the optional fields afterwards

### Requirement: Promotion writes a SourceSpec into a pack
`promote_source(id, spec)` SHALL write an exported `SourceSpec` into `packs/<category>/sources.ts`, mark the candidate `promoted`, and stamp the promotion.

#### Scenario: Promotion emits a type-checked pack entry
- **WHEN** a curated candidate is promoted
- **THEN** a `SourceSpec` is written to the pack file for its category and the candidate's status becomes `promoted`

#### Scenario: Promotion happens once
- **WHEN** the same candidate is promoted a second time
- **THEN** the call fails with `AlreadyPromoted` and the pack file is unchanged

### Requirement: MCP and CLI front-ends share one service
The harness SHALL expose `claim_work`, `submit_candidate`, `enrich_candidate`, `list_candidates`, and `promote_source` over both an MCP server and a CLI, with both front-ends delegating to the same Effect service and holding no business logic.

#### Scenario: Agents and humans exercise identical paths
- **WHEN** the same operation is invoked over MCP and over the CLI
- **THEN** both run the same service code path and produce the same result (I8 agent parity)

### Requirement: Seeded discovery plan exposes coverage
The queue SHALL be seedable from the OSINT landscape catalog as categories × archetypes, and optionally from the Bellingcat toolkit CSV.

#### Scenario: Uncovered work stays visible
- **WHEN** discovery has not yet reached some `{category, archetype}` units
- **THEN** those units remain in the queue as the coverage signal

## Non-goals
- No harness-owned search or crawl pipeline — agents bring their own search.
- No runtime execution of promoted sources; that is the `source-runtime` capability.
- No shared or fleet backend — SQLite single-file first, behind the store seams (TDR-013).
- No governance or redaction; candidates are public source metadata, not evidence.
