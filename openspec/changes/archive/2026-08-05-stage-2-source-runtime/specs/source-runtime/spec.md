## Purpose

Defines the acquisition pipeline that turns any source (online service, database, media store, drive, OSINT tool) into a normalized, provenance-carrying evidence record.

## ADDED Requirements

### Requirement: Source is described by a full acquisition spec
The system SHALL describe a source with a `SourceSpec` carrying transport, auth, retry/backoff, timeout, rate-limit, key-rotation, cache policy, egress policy, and a response schema → projection mapping.

#### Scenario: Source with full configuration
- **WHEN** a source is configured with transport, auth, policies and a projection
- **THEN** the runtime can acquire from that source using the configured settings

### Requirement: Every acquisition normalizes to evidence
The system SHALL run any source through one pipeline that ends in an `EvidenceInput` with its raw bytes, content type, timestamps, and acquisition path.

#### Scenario: Acquisition produces normalized evidence
- **WHEN** a source response is acquired
- **THEN** the pipeline returns an evidence record with raw bytes, content type, and acquisition path (`live`/`cache`/`proxy`)

### Requirement: Retry and backoff are applied to failing transports
The system SHALL apply configurable retry/backoff to transport failures and SHALL surface a typed error when retries are exhausted.

#### Scenario: Transient failure retries
- **WHEN** a transport fails transiently within the retry budget
- **THEN** the runtime retries with backoff and ultimately succeeds

#### Scenario: Retries exhausted
- **WHEN** a transport fails beyond the retry budget
- **THEN** the runtime reports a typed retry-exhausted error and records no evidence

### Requirement: Rate limits are enforced by the runtime
The system SHALL enforce a per-source rate limit so acquisitions do not exceed the configured budget.

#### Scenario: Over the rate limit
- **WHEN** an acquisition would exceed the source's configured rate limit
- **THEN** the runtime defers or reports a typed rate-limited error without exceeding the budget

### Requirement: Response projection maps source output to evidence
The system SHALL project a source's raw response into a normalized form according to its response schema.

#### Scenario: Projecting a source response
- **WHEN** a source response matches its response schema
- **THEN** the projection yields the evidence payload defined by that schema

### Requirement: Policy is runtime-owned, not caller-owned
The system SHALL keep retry, rate-limit, cache, and egress policy inside the runtime so transforms and UI never select transport/cache/proxy behavior themselves.

#### Scenario: Policy not bypassable by callers
- **WHEN** a caller requests an acquisition
- **THEN** only the runtime's configured policy applies, and the caller cannot override cache mode or egress path
