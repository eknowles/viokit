## ADDED Requirements

### Requirement: Evidence never carries the credential used to acquire it
Evidence produced by acquiring a credential-gated source SHALL record the acquisition as it does any
other, without the credential that authorised it.

#### Scenario: Stored evidence is free of the credential
- **WHEN** evidence is produced by acquiring a source that required a credential
- **THEN** the stored record contains no credential value
