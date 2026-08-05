# Cache

## Purpose

Defines the multi-tier response cache that lets the runtime serve repeat acquisitions from memory or disk without re-egressing the source.

## Requirements

### Requirement: Cache is a multi-tier read-through store
The system SHALL provide a `CacheStore` with an in-memory L1 tier and a filesystem on-disk L2 tier, both behind one seam.

#### Scenario: Serving from the in-memory tier
- **WHEN** a request was recently cached and is still within its tier's memory lifetime
- **THEN** the cache serves it from the L1 tier without touching L2

#### Scenario: Serving from the on-disk tier
- **WHEN** a request is absent from L1 but present on disk and still fresh
- **THEN** the cache serves it from the L2 tier

#### Scenario: Miss triggers acquisition
- **WHEN** a request is absent from both tiers
- **THEN** the runtime acquires from the source and writes the result to the cache

### Requirement: Cache keys are request fingerprints without credentials
The system SHALL derive a cache key from a stable fingerprint of the request that excludes secrets (API keys, tokens).

#### Scenario: Key excludes credentials
- **WHEN** two identical requests differ only in their credential value
- **THEN** they resolve to the same cache key

### Requirement: Cache modes control freshness and egress
The system SHALL support `live-only`, `cache-first`, `cache-only`, and `refresh` modes, governing when egress is allowed and how stale data is handled.

#### Scenario: Live-only never reads the cache
- **WHEN** a source is in `live-only` mode
- **THEN** every acquisition egresses the source and the cache is not read for it

#### Scenario: Cache-first uses cache before egress
- **WHEN** a source is in `cache-first` mode and a fresh entry exists
- **THEN** the cache serves it without egressing the source

#### Scenario: Refresh ignores the cache
- **WHEN** a source is in `refresh` mode
- **THEN** the runtime egresses the source and overwrites the cache entry

#### Scenario: Stale entries serve within max-stale
- **WHEN** a cache entry is expired but within its configured max-stale window
- **THEN** the cache serves the stale entry

### Requirement: Cache-only guarantees offline determinism
The system SHALL run `cache-only` acquisitions without any egress and SHALL fail with a typed offline-cache-miss error when no usable entry exists.

#### Scenario: Cache-only with no entry
- **WHEN** a `cache-only` request has no fresh or max-stale entry
- **THEN** the runtime returns a typed offline-cache-miss error and performs no egress

#### Scenario: Cache-only with an entry
- **WHEN** a `cache-only` request has a fresh or max-stale entry
- **THEN** the runtime serves it with no source egress
