## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: A bundle attests with the artifact's own identifier
The digest a bundle records for an artifact SHALL be that artifact's identifier, so a recipient
verifies the artifact and confirms it is the one the steps reference in a single check.

#### Scenario: The recorded digest is the identifier
- **WHEN** a bundle records an artifact
- **THEN** the digest in its manifest equals the identifier the steps reference
