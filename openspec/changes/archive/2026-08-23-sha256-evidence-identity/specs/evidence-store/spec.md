## ADDED Requirements

### Requirement: A stored artifact can be verified against its identifier
A recipient holding an artifact and its identifier SHALL be able to confirm the two correspond using
standard tools, without software from this system.

#### Scenario: An artifact verifies against its identifier
- **WHEN** the cryptographic digest of a stored artifact's bytes is computed independently
- **THEN** it equals that artifact's identifier
