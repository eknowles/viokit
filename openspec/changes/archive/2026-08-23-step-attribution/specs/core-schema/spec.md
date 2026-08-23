## ADDED Requirements

### Requirement: Sources carry a version
A source specification SHALL carry a version identifying the state of the source it describes, so
outputs derived from it can cite which version they rest on (I7). A specification that declares no
version SHALL read as explicitly unversioned rather than as any particular version.

#### Scenario: A declared version is carried
- **WHEN** a source specification declaring a version is decoded
- **THEN** it carries that version

#### Scenario: An undeclared version is explicit
- **WHEN** a source specification declaring no version is decoded
- **THEN** its version reads as unversioned, not as a default that implies currency

### Requirement: Steps record what produced them
A step derived by running a transform SHALL record the transform that ran, the source it acquired
from, and that source's version, so a claim can be traced to what derived it and the state that thing
was in (I7).

#### Scenario: A derived step cites its origin
- **WHEN** a step is produced by running a transform against a source
- **THEN** it records that transform, that source, and that source's version

#### Scenario: A step with no source records none
- **WHEN** a step is derived from existing graph state rather than from an acquisition
- **THEN** it records no source, rather than an inaccurate one

#### Scenario: Attribution survives the log
- **WHEN** a step carrying attribution is committed and the investigation replayed
- **THEN** the attribution is still present
