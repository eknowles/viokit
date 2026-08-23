## ADDED Requirements

### Requirement: Evidence can be read back
The engine SHALL return a stored evidence record by its identifier, so the artifacts a graph is built
on can be inspected rather than only written. An identifier that is not stored SHALL read as absent
rather than as an error.

#### Scenario: A stored artifact is retrieved
- **WHEN** evidence is stored and then requested by its identifier
- **THEN** the engine returns that record, including how it was acquired

#### Scenario: An unknown identifier reads as absent
- **WHEN** evidence is requested for an identifier that was never stored
- **THEN** the engine reports absence

#### Scenario: Reading evidence changes nothing
- **WHEN** evidence is read
- **THEN** no step is appended and no evidence is written
