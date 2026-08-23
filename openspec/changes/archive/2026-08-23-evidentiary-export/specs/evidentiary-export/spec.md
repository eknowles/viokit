## Purpose

Produces a portable record of how an investigation reached its conclusions — the artifacts, the steps
that derived claims from them, and what produced each step — that a recipient can verify and rebuild
without running the tool that made it.

## ADDED Requirements

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
A bundle SHALL record that the internal evidence identifier is a content-addressing key rather than a
tamper-evidence guarantee, so a recipient does not mistake it for one.

#### Scenario: The manifest is explicit about the identifier
- **WHEN** a bundle's manifest is read
- **THEN** it states which digest attests integrity and that the evidence identifier does not

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
