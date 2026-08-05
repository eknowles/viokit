# Evidence Store

## Purpose

Provides durable, content-addressed evidence persistence so acquired evidence survives restarts, is stored once, and is never mutated after write.

## Requirements

### Requirement: Evidence is stored content-addressed and write-once
The evidence store SHALL address stored evidence by the content hash of its raw bytes, SHALL reject overwriting an existing id with different bytes, and SHALL return the existing record when identical bytes are written again.

#### Scenario: Identical bytes are deduplicated
- **WHEN** the same raw bytes are stored twice
- **THEN** both writes resolve to the same evidence id and only one record exists

#### Scenario: Content is immutable after write
- **WHEN** a stored record is read after a second write with identical bytes
- **THEN** the returned record is byte-for-byte identical to what was written

### Requirement: Evidence survives process restart
The evidence store SHALL persist evidence to a durable backend such that evidence written in one run is readable in a later run against the same backend.

#### Scenario: Persistence across runs
- **WHEN** evidence is written and then the store is reopened on the same backend location
- **THEN** previously written evidence is retrievable by its id

### Requirement: Provenance is preserved per acquisition
Every stored evidence record SHALL retain its acquisition path (`live`/`cache`/`proxy`) and timestamps, unchanged from ingestion.

#### Scenario: Acquisition path is retained
- **WHEN** evidence acquired with a given acquisition path is stored and read back
- **THEN** the record reports the same acquisition path

### Requirement: Missing evidence reads as absent
Reading evidence by an id that was never written SHALL yield an explicit "not found" outcome rather than an error or a fabricated record.

#### Scenario: Reading an unknown id
- **WHEN** a read is issued for an id with no stored evidence
- **THEN** the store reports the id as not found
