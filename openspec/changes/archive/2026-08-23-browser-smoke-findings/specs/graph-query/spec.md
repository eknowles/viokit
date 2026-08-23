## ADDED Requirements

### Requirement: Replay is unaffected by concurrent readers
Replaying an investigation SHALL produce the same graph whether or not other replays are in progress,
so the folded state depends only on the step log (I3).

#### Scenario: Concurrent replays agree with a sequential one
- **WHEN** two replays run at the same time
- **THEN** each returns the same graph a single replay would have returned

#### Scenario: Repeated concurrent replays do not accumulate
- **WHEN** many replays run at the same time
- **THEN** none returns more of the graph than the step log folds to
