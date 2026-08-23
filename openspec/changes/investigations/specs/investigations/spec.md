## ADDED Requirements

### Requirement: Work belongs to an investigation
The system SHALL provide investigations as the unit of work, and every step SHALL belong to exactly
one. A step SHALL NOT exist outside an investigation.

#### Scenario: Work is recorded against the open investigation
- **WHEN** an acquisition or transform produces a step while an investigation is open
- **THEN** the step belongs to that investigation

#### Scenario: An investigation can be listed, opened, and closed
- **WHEN** investigations exist
- **THEN** each can be listed by name, opened, and closed

#### Scenario: Work cannot be recorded without one
- **WHEN** a step would be recorded with no investigation to record it against
- **THEN** the operation fails, rather than recording it somewhere arbitrary

### Requirement: One investigation's work never appears in another's
The system SHALL scope replay, the step log, and every graph query to one investigation. Reaching
across investigations SHALL be possible only through an operation that names that intent.

#### Scenario: Replay reflects one investigation
- **WHEN** two investigations have both recorded work
- **THEN** replaying one reproduces only its own state

#### Scenario: Queries answer for one investigation
- **WHEN** a path, timeline, spatial, or relatedness query runs against an investigation
- **THEN** its results contain nothing from any other

#### Scenario: Crossing investigations is deliberate
- **WHEN** a caller wants to know what more than one investigation has in common
- **THEN** it must use an operation that says so, which no ordinary query can be mistaken for

### Requirement: A hypothesis can be worked without disturbing its case
The system SHALL allow an investigation to be branched, so work can proceed on a hypothesis and then
be kept or discarded. Branching SHALL NOT rewrite history (I3).

#### Scenario: A branch starts from what its parent knew
- **WHEN** an investigation is branched
- **THEN** the branch replays to the state its parent held at the fork

#### Scenario: Work on a branch stays there
- **WHEN** steps are recorded on a branch
- **THEN** its parent's replay is unchanged

#### Scenario: A branch that is discarded leaves the record intact
- **WHEN** a branch is discarded
- **THEN** no step is removed from the log
- **AND** the branch no longer contributes to its parent

#### Scenario: Forking is cheap enough to be routine
- **WHEN** an investigation with substantial history is branched
- **THEN** the branch is available without copying that history

### Requirement: An investigation replays deterministically
Replaying an investigation SHALL reproduce its state exactly, as replay does today for the whole log
(I3), and SHALL do so offline from cache alone where its acquisitions permit (I11).

#### Scenario: Replay is reproducible
- **WHEN** an investigation is replayed twice
- **THEN** both replays produce the same state

#### Scenario: Offline determinism holds per investigation
- **WHEN** an investigation whose sources were cached is replayed with egress disabled
- **THEN** it reproduces the same state

### Requirement: Evidence is shared, and the sharing is visible
Artifacts SHALL remain content-addressed and shared across investigations, so the same bytes are one
artifact. The system SHALL be able to report which artifacts more than one investigation cites.

#### Scenario: The same artifact acquired twice is stored once
- **WHEN** two investigations acquire identical bytes
- **THEN** the evidence store holds one artifact, cited by both

#### Scenario: Overlap between cases can be surfaced
- **WHEN** two investigations cite the same artifact
- **THEN** that overlap can be reported
