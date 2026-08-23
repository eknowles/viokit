# Evidentiary Export

## Purpose

Produces a portable record of how an investigation reached its conclusions — the artifacts, the steps
that derived claims from them, and what produced each step — that a recipient can verify and rebuild
without running the tool that made it.

## Requirements

### Requirement: A bundle carries the whole trail
An exported bundle SHALL contain the investigation's graph, its complete step log, the evidence each
step was attributed to, and the raw artifacts themselves, so a claim can be followed to the bytes
behind it without reference to the system that produced it.

#### Scenario: Every step is present
- **WHEN** an investigation is exported
- **THEN** the bundle's manifest lists every step in the log, with the evidence each was attributed to

#### Scenario: Every referenced artifact is present
- **WHEN** an investigation is exported
- **THEN** every evidence artifact any step references is included as a file in the bundle

#### Scenario: Attribution travels with the step
- **WHEN** a step recording what produced it is exported
- **THEN** the bundle records that transform, source, and source version

### Requirement: A bundle is independently verifiable
A bundle SHALL carry a cryptographic digest for each artifact, in a form a recipient can check with
standard tools rather than software from this system.

#### Scenario: Digests match the artifacts
- **WHEN** a bundle's recorded digest for an artifact is recomputed from that artifact's bytes
- **THEN** the two agree

#### Scenario: A corrupted artifact is detectable
- **WHEN** an artifact in a bundle is altered after export
- **THEN** its recorded digest no longer matches its bytes

### Requirement: A bundle states what it does not prove
A bundle SHALL be explicit about the scope of what it attests: that its digests establish the
artifacts are as they were at export, and that they say nothing about custody before that point.

#### Scenario: The manifest describes the scope of its attestation
- **WHEN** a bundle's manifest is read
- **THEN** it states that integrity is attested as of export and that earlier custody is not covered

#### Scenario: The manifest is explicit about the identifier
- **WHEN** a bundle's manifest is read
- **THEN** it states that an artifact's identifier is the cryptographic digest of its bytes, so
  verifying the digest also confirms the artifact is the one the steps reference

### Requirement: A bundle reproduces the investigation
The graph rebuilt from a bundle's step log SHALL equal the graph the bundle records, so a bundle that
cannot reproduce what it claims is detectable as such (I3).

#### Scenario: Replaying the bundle reproduces its graph
- **WHEN** the step log in a bundle is folded into a graph
- **THEN** that graph matches the graph the bundle records

### Requirement: A bundle reports what it could not include
Where an artifact a step references cannot be retrieved, the bundle SHALL record that omission rather
than exporting silently, because a trail with an unreported gap misrepresents itself.

#### Scenario: A missing artifact is reported
- **WHEN** a step references evidence the store cannot produce
- **THEN** the bundle records that artifact as missing

### Requirement: A bundle attests with the artifact's own identifier
The digest a bundle records for an artifact SHALL be that artifact's identifier, so a recipient
verifies the artifact and confirms it is the one the steps reference in a single check.

#### Scenario: The recorded digest is the identifier
- **WHEN** a bundle records an artifact
- **THEN** the digest in its manifest equals the identifier the steps reference
