## ADDED Requirements

### Requirement: View state is saved and loaded through the operations
The operations SHALL include saving and loading view state, so any front-end can persist a surface's
configuration through the same service as everything else, with no privileged path (I8).

#### Scenario: A front-end saves and restores view state
- **WHEN** a front-end saves view state for a key and later loads that key
- **THEN** it receives what it saved

#### Scenario: Both surfaces can do it
- **WHEN** the operations exposed by each front-end are compared
- **THEN** saving and loading view state appear on all of them
