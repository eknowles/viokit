## ADDED Requirements

### Requirement: A candidate says where it came from
The system SHALL require every submitted candidate to record where the claim that the source exists
came from, so a lead can be traced back to its origin.

#### Scenario: A submission without provenance is refused
- **WHEN** a candidate is submitted without an origin
- **THEN** the submission is refused

#### Scenario: Classification stays optional
- **WHEN** a candidate is submitted with identity and origin but no classification
- **THEN** it is accepted, to be enriched later

### Requirement: Promotion requires a classification that was checked
The system SHALL refuse to promote a candidate without a verification of what the source actually
serves, and SHALL record on the promoted spec the artifacts that verification was derived from.

#### Scenario: An unverified promotion is refused
- **WHEN** a candidate is promoted with no verification
- **THEN** the promotion is refused

#### Scenario: A verification that concluded nothing is not a verification
- **WHEN** a candidate is promoted with a verification whose classification is unknown
- **THEN** the promotion is refused, naming why nothing could be concluded

#### Scenario: A verification of a different source is refused
- **WHEN** a candidate is promoted with a verification belonging to another source
- **THEN** the promotion is refused

#### Scenario: A verification naming no evidence is refused
- **WHEN** a candidate is promoted with a verification that names no artifacts
- **THEN** the promotion is refused, because the claim could not be checked

#### Scenario: A verified promotion records what it was checked against
- **WHEN** a candidate is promoted with a verification that concluded a classification
- **THEN** the written spec carries that classification and the artifacts behind it
