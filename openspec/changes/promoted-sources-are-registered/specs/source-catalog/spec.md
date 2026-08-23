## ADDED Requirements

### Requirement: A promoted source is registered, not only written
Promotion SHALL leave a source visible to a deployment that registers its pack. A source present in a
pack's files but absent from that pack's manifest SHALL be reported as an error rather than silently
ignored.

#### Scenario: Every source a pack ships is registered by it
- **WHEN** a pack's sources are compared with what its manifest registers
- **THEN** every source the pack ships is named by the manifest

#### Scenario: A pack that registers nothing is an error
- **WHEN** a pack ships sources and has no manifest at all
- **THEN** that is reported as an error

### Requirement: Promotion writes into the pack tree the deployment reads
Promotion SHALL resolve the pack location from configuration rather than from the working directory,
so a promoted source lands where the catalog looks for it.

#### Scenario: A promoted source lands in the configured pack tree
- **WHEN** a candidate is promoted
- **THEN** its spec is written into the configured pack location

#### Scenario: Promoting a second source keeps the first
- **WHEN** a second candidate is promoted into a pack that already holds one
- **THEN** both sources are present afterwards

#### Scenario: An invalid spec is refused before anything is written
- **WHEN** promotion is given something that is not a valid source spec
- **THEN** it fails, and the pack files are left as they were
