## ADDED Requirements

### Requirement: Both front-ends can verify a source's access classification
The operation surface SHALL expose access verification, identically on every front-end, so an agent
can check a classification through the same path a human does (I8).

#### Scenario: An agent verifies a source it found in the catalog
- **WHEN** an agent lists the catalog and verifies one of the sources it names
- **THEN** it receives the observed classification, the declared one, and the evidence behind the
  observation

#### Scenario: Verifying an unknown source is an unknown-entry failure
- **WHEN** verification is requested for a source id the catalog does not know
- **THEN** it fails as an unknown catalog entry rather than as an acquisition failure
