## ADDED Requirements

### Requirement: Evidence is retrievable through the operations
The operations SHALL include retrieving evidence by identifier, so any front-end can follow a step to
the artifact that justifies it (I2, I8).

#### Scenario: A front-end follows a step to its evidence
- **WHEN** a caller retrieves the evidence an inserted step was attributed to
- **THEN** it receives that record with its acquisition path

#### Scenario: Content is withheld unless requested
- **WHEN** evidence is retrieved without asking for its content
- **THEN** the response describes the artifact without carrying its bytes

#### Scenario: Content is returned when requested
- **WHEN** evidence is retrieved with content requested
- **THEN** the response carries the artifact's bytes in a form the caller can decode
