## ADDED Requirements

### Requirement: Evidence identity is a cryptographic digest
An evidence artifact's identifier SHALL be a cryptographic digest of its bytes, so that the
identifier attests to the content rather than merely indexing it, and so a recipient can verify an
artifact against its identifier using standard tools.

#### Scenario: The identifier is the digest of the bytes
- **WHEN** an artifact is stored
- **THEN** its identifier equals the cryptographic digest of its bytes

#### Scenario: Altered bytes cannot keep the identifier
- **WHEN** an artifact's bytes differ in any way from another's
- **THEN** their identifiers differ

#### Scenario: Identical bytes still resolve to one artifact
- **WHEN** the same bytes are stored twice
- **THEN** both resolve to the same identifier and the same stored artifact
